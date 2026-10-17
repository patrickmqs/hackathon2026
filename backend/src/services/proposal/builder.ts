import type { MeetingAnalysis } from "../../schemas/analysis.js";
import type { ProposalContent } from "../../schemas/proposal.js";
import type { MeetingRecord, ProjectRecord } from "../../repositories/repo.js";
import { estimate, type EstimateResult } from "../estimation/engine.js";

// Builder da proposta — B8. Converte a análise revisada (MeetingAnalysis) + estimativas
// determinísticas em um `ProposalContent` válido (schema `schemas/proposal.ts`).
// A IA propõe, o humano decide: o conteúdo gerado aqui ainda passa por edição/versões.

const DEMO_RATES: Record<string, number> = {
  backend_dev: 180,
  frontend_dev: 160,
  qa: 120,
  ux: 140,
  pm: 150,
};

export interface BuildProposalInput {
  project: ProjectRecord;
  meeting: MeetingRecord;
  analysis: MeetingAnalysis;
  language?: string;
  includeDemoRates?: boolean;
}

export function buildProposalContent(input: BuildProposalInput): ProposalContent {
  const { project, meeting, analysis } = input;
  const language = input.language ?? "pt-BR";
  const includeDemoRates = input.includeDemoRates ?? true;
  const client = project.client as {
    company?: string;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
  };

  const modules = analysis.modules.map((m) => {
    const complexity = m.complexity === "unknown" ? "M" : m.complexity;
    const features = analysis.requirements.filter((r) => r.module_id === m.id).map((r) => r.title);
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      features,
      complexity,
      source_requirement_ids: m.requirement_ids,
    };
  });

  const integrationCount = analysis.requirements.filter((r) => r.type === "integration").length;
  const nfrCount = analysis.requirements.filter((r) => r.type === "non_functional").length;
  const unresolved = analysis.open_issues.filter(
    (i) => i.impact.includes("effort") || i.impact.includes("architecture"),
  ).length;

  const result = estimate({
    modules: modules.map((m) => ({ id: m.id, complexity: m.complexity })),
    integrationCount,
    nfrCount,
    unresolvedEffortIssues: unresolved,
  });

  const now = new Date().toISOString();
  const outOfScope = analysis.decisions
    .filter((d) => d.scope_effect === "out_of_scope")
    .map((d) => d.description);

  const content: ProposalContent = {
    schema_version: "1.0",
    title: project.name,
    client: {
      company: client.company ?? project.name,
      contact_name: client.contact_name ?? null,
      contact_email: client.contact_email ?? null,
      contact_phone: client.contact_phone ?? null,
    },
    vendor: {
      company: "Proposal AI (demo)",
      contact_name: null,
      contact_email: null,
      website: null,
      is_demo_profile: true,
    },
    executive_summary: analysis.summary,
    business_context: businessContext(analysis),
    objectives: analysis.client_needs
      .filter((n) => n.category === "business_goal")
      .map((n) => n.description),
    scope: {
      in_scope: analysis.requirements.map((r) => r.title),
      out_of_scope: outOfScope,
    },
    modules,
    requirements_and_integrations: analysis.requirements.map((r) => ({
      title: r.title,
      description: r.description,
      type: r.type,
    })),
    architecture: {
      overview: architectureOverview(analysis),
      components: analysis.modules.map((m) => ({ name: m.name, responsibility: m.description })),
      technologies: technologies(analysis),
      diagram_mermaid: null,
      is_ai_suggestion: true,
    },
    assumptions: [
      ...analysis.tech_suggestions.filter((t) => t.category === "assumption").map((t) => t.description),
      ...analysis.limitations,
    ],
    dependencies: analysis.requirements.flatMap((r) => r.depends_on),
    exclusions: outOfScope,
    estimates: {
      method: "deterministic_rules",
      basis_label: "Horas por complexidade (S/M/L/XL) + sobretaxas de integração/NFR",
      lines: result.lines,
      totals_by_profile: result.totals_by_profile,
      total_hours_min: result.total_hours_min,
      total_hours_max: result.total_hours_max,
      confidence: result.confidence,
      assumptions: result.assumptions,
    },
    team: buildTeam(result),
    schedule: buildSchedule(result.total_weeks),
    total_weeks: result.total_weeks,
    risks: analysis.open_issues
      .filter((i) => i.type === "risk")
      .map((i) => ({ description: i.description, mitigation: i.suggested_question ?? "" })),
    open_points: analysis.open_issues.map((i) => ({
      description: i.description,
      question: i.suggested_question ?? "",
    })),
    commercial: {
      status: includeDemoRates ? "demo_rates" : "not_provided",
      currency: "BRL",
      hourly_rates: includeDemoRates ? DEMO_RATES : null,
      total_min: null,
      total_max: null,
      payment_terms: null,
      validity_days: 15,
      disclaimer: "Valores demonstrativos gerados por regras determinísticas.",
    },
    next_steps: nextSteps(analysis),
    meta: {
      version: 1,
      revision_label: "v1",
      created_at: now,
      language,
      source_meeting_id: meeting.id,
      source_analysis_prompt_version: analysis.meta.prompt_version,
    },
  };

  return content;
}

function businessContext(analysis: MeetingAnalysis): string {
  const problems = analysis.client_needs.filter((n) => n.category === "problem").map((n) => n.description);
  if (problems.length) return problems.join(" ");
  return analysis.summary;
}

function architectureOverview(analysis: MeetingAnalysis): string {
  const arch = analysis.tech_suggestions.filter(
    (t) => t.category === "architecture" || t.category === "technology",
  );
  if (arch.length) return arch.map((t) => t.description).join(" ");
  return "Arquitetura a definir em conjunto com o cliente.";
}

function technologies(analysis: MeetingAnalysis): Array<{ layer: string; choice: string; rationale: string }> {
  return analysis.tech_suggestions
    .filter((t) => t.category === "technology")
    .map((t) => ({ layer: t.category, choice: t.description, rationale: t.rationale }));
}

function buildTeam(result: EstimateResult): Array<{
  phase: string;
  duration_weeks: number;
  roles: Array<{ profile: string; allocation_pct: number; count: number }>;
}> {
  const roles = Object.entries(result.totals_by_profile)
    .filter(([, t]) => t.hours_max > 0)
    .map(([profile]) => ({ profile, allocation_pct: 100, count: 1 }));
  return [{ phase: "Execução", duration_weeks: result.total_weeks, roles }];
}

function buildSchedule(totalWeeks: number): Array<{
  name: string;
  duration_weeks: number;
  depends_on: string[];
  deliverables: string[];
}> {
  const names = ["Descoberta", "Implementação", "Validação", "Entrega"];
  const per = Math.max(1, Math.round(totalWeeks / names.length));
  return names.map((name, i) => ({
    name,
    duration_weeks: per,
    depends_on: i === 0 ? [] : [names[i - 1]],
    deliverables: i === names.length - 1 ? ["Sistema entregue", "Documentação"] : ["Marco concluído"],
  }));
}

function nextSteps(analysis: MeetingAnalysis): string[] {
  const commitments = analysis.commitments.slice(0, 3).map((c) => `${c.owner}: ${c.description}`);
  return commitments.length ? commitments : ["Revisar e aprovar esta proposta."];
}
