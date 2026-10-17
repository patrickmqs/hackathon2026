// Composição textual da proposta (etapa 9, LLM #3; docs/AI_PIPELINE.md §2, §5, §9).
// A IA redige, não estima: os números vêm do motor determinístico e `assertNumbersUnchanged`
// rejeita texto que cite horas/semanas/valores fora das estimativas.
import { structuredCompletion } from "../../integrations/openai/client.js";
import { AiOutputInvalidError } from "../../core/errors.js";
import { loadPrompt } from "../aiAnalysis/prompts/loader.js";
import { z } from "zod";

// ATENÇÃO: o backend ainda não enxerga `shared/` (sem workspace; tsconfig com rootDir=src), então o
// schema abaixo é uma CÓPIA de `ProposalTextOutput` (shared/src/schemas/proposal.ts). O teste
// tests/composer.test.ts compara o JSON Schema das duas versões para impedir divergência.
// Quando o workspace existir, troque por `import { ProposalTextOutput } from "@proposal-ai/shared"`.
const RequirementItem = z.object({ title: z.string(), description: z.string(), type: z.string() });
export const ProposalTextOutput = z.object({
  title: z.string(),
  executive_summary: z.string(),
  business_context: z.string(),
  objectives: z.array(z.string()),
  scope: z.object({ in_scope: z.array(z.string()), out_of_scope: z.array(z.string()) }),
  modules: z.array(z.object({ id: z.string(), description: z.string(), features: z.array(z.string()) })),
  requirements_and_integrations: z.array(RequirementItem),
  architecture: z.object({
    overview: z.string(),
    components: z.array(z.object({ name: z.string(), responsibility: z.string() })),
    technologies: z.array(z.object({ layer: z.string(), choice: z.string(), rationale: z.string() })),
    diagram_mermaid: z.string().nullable(),
  }),
  assumptions: z.array(z.string()),
  dependencies: z.array(z.string()),
  exclusions: z.array(z.string()),
  risks: z.array(z.object({ description: z.string(), mitigation: z.string() })),
  open_points: z.array(z.object({ description: z.string(), question: z.string() })),
  next_steps: z.array(z.string()),
});
export type ProposalTextOutput = z.infer<typeof ProposalTextOutput>;

// Tipos estruturais mínimos do que o composer lê de MeetingAnalysis / EstimateResult (shared).
interface ReviewedItem {
  id: string;
  review_status: string;
  source_refs: unknown;
  reviewer_note: unknown;
}
export interface ComposerAnalysis {
  summary: string;
  participants: unknown[];
  client_needs: ReviewedItem[];
  requirements: (ReviewedItem & { depends_on: string[] })[];
  modules: { id: string; name: string; description: string; requirement_ids: string[]; complexity: string }[];
  decisions: ReviewedItem[];
  commitments: ReviewedItem[];
  open_issues: (ReviewedItem & { related_ids?: unknown })[];
  tech_suggestions: ReviewedItem[];
  limitations: string[];
  [key: string]: unknown;
}
type MeetingAnalysis = ComposerAnalysis;

/** Estimativas já calculadas (somente leitura para o LLM). */
export interface ComposerEstimates {
  estimates: {
    method: string;
    basis_label: string;
    lines: { module_id: string; profile: string; hours_min: number; hours_max: number; rationale: string | null }[];
    totals_by_profile: Record<string, { hours_min: number; hours_max: number }>;
    total_hours_min: number;
    total_hours_max: number;
    confidence: "high" | "medium" | "low";
    assumptions: string[];
  };
  team?: unknown[];
  schedule?: unknown[];
  total_weeks?: number;
  commercial?: unknown;
}

export interface VendorProfileInput {
  company: string;
  contact_name?: string | null;
  contact_email?: string | null;
  website?: string | null;
  is_demo_profile?: boolean;
  [key: string]: unknown;
}

const isReviewed = (i: { review_status: string }) => i.review_status === "confirmed" || i.review_status === "edited";

/** Mantém só itens confirmed/edited; módulos sem requisito revisado saem; ids órfãos são removidos. */
export function filterReviewed(a: MeetingAnalysis): MeetingAnalysis {
  const requirements = a.requirements.filter(isReviewed);
  const reqIds = new Set(requirements.map((r) => r.id));
  const modules = a.modules
    .map((m) => ({ ...m, requirement_ids: m.requirement_ids.filter((id) => reqIds.has(id)) }))
    .filter((m) => m.requirement_ids.length > 0);
  const decisions = a.decisions.filter(isReviewed);
  const commitments = a.commitments.filter(isReviewed);
  const needs = a.client_needs.filter(isReviewed);
  const suggestions = a.tech_suggestions.filter(isReviewed);
  const alive = new Set<string>([
    ...reqIds,
    ...modules.map((m) => m.id),
    ...[...decisions, ...commitments, ...needs, ...suggestions].map((i) => i.id),
  ]);
  const open_issues = a.open_issues.filter(isReviewed).map((i) => ({
    ...i,
    // não vaza ids de itens descartados na revisão
    related_ids: Array.isArray(i.related_ids) ? (i.related_ids as string[]).filter((id) => alive.has(id)) : i.related_ids,
  }));
  return {
    ...a,
    client_needs: needs,
    requirements: requirements.map((r) => ({ ...r, depends_on: r.depends_on.filter((id) => reqIds.has(id)) })),
    modules,
    decisions,
    commitments,
    open_issues,
    tech_suggestions: suggestions,
  };
}

// --- Validador puro de números ---

const UNIT = String.raw`(?:h|hs|horas?|hours?|semanas?|weeks?)\b`;
const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;
const NUM_RE = new RegExp(String.raw`(R\$\s*)?(${NUM})`, "g");
const UNIT_AFTER = new RegExp(String.raw`^\s*(?:(?:–|—|-|a|até|e)\s*(?:${NUM})\s*)?${UNIT}`, "i");

function parsePt(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

function collectNumbers(v: unknown, out: Set<number>): void {
  if (typeof v === "number") out.add(v);
  else if (Array.isArray(v)) v.forEach((x) => collectNumbers(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectNumbers(x, out));
}

function collectStrings(v: unknown, out: string[]): void {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectStrings(x, out));
}

/**
 * Números "de esforço" citados no texto (horas, semanas, valores em R$) que não existem em `estimates`.
 * Só inspeciona números com unidade (h/horas/semanas) ou prefixo R$; outros (ex.: "2 s", "50 usuários")
 * são livres. `diagram_mermaid` é ignorado.
 */
export function findNumberViolations(text: ProposalTextOutput, est: ComposerEstimates): string[] {
  const hours = new Set<number>();
  collectNumbers(est.estimates, hours);
  const weeks = new Set<number>();
  if (typeof est.total_weeks === "number") weeks.add(est.total_weeks);
  for (const p of [...(est.team ?? []), ...(est.schedule ?? [])]) {
    const w = (p as { duration_weeks?: unknown }).duration_weeks;
    if (typeof w === "number") weeks.add(w);
  }
  const money = new Set<number>();
  const c = (est.commercial ?? {}) as { total_min?: unknown; total_max?: unknown; hourly_rates?: unknown };
  collectNumbers([c.total_min, c.total_max, c.hourly_rates], money);

  const strings: string[] = [];
  const { architecture, ...rest } = text;
  collectStrings(rest, strings);
  collectStrings({ ...architecture, diagram_mermaid: null }, strings);

  const bad = new Set<string>();
  for (const s of strings) {
    for (const m of s.matchAll(NUM_RE)) {
      const value = parsePt(m[2]!);
      const after = s.slice(m.index! + m[0].length);
      let allowed: Set<number>;
      if (m[1]) allowed = money;
      else {
        const u = UNIT_AFTER.exec(after);
        if (!u) continue;
        allowed = /sem|week/i.test(u[0]) ? weeks : hours;
      }
      if (!allowed.has(value)) bad.add(m[0].trim());
    }
  }
  return [...bad];
}

export class NumbersChangedError extends AiOutputInvalidError {
  constructor(readonly violations: string[]) {
    super(`O texto citou números fora das estimativas: ${violations.join(", ")}`, violations);
    this.name = "NumbersChangedError";
  }
}

/** Lança se o texto citar horas/semanas/valores que não constam em `estimates`. */
export function assertNumbersUnchanged(text: ProposalTextOutput, est: ComposerEstimates): void {
  const v = findNumberViolations(text, est);
  if (v.length > 0) throw new NumbersChangedError(v);
}

/** Módulos devolvidos devem ser exatamente os recebidos (nem novos, nem faltando). */
export function assertModulesMatch(text: ProposalTextOutput, analysis: MeetingAnalysis): void {
  const expected = analysis.modules.map((m) => m.id).sort();
  const got = text.modules.map((m) => m.id).sort();
  if (JSON.stringify(expected) !== JSON.stringify(got)) {
    throw new AiOutputInvalidError(`Módulos da proposta (${got.join(",")}) diferem dos recebidos (${expected.join(",")})`);
  }
}

function buildInput(analysis: MeetingAnalysis, est: ComposerEstimates, vendor: VendorProfileInput, feedback?: string) {
  // Sem source_refs/metadados: o redator não precisa de citações nem de ids de revisão.
  const strip = <T extends { source_refs: unknown; review_status: unknown; reviewer_note: unknown }>(items: T[]) =>
    items.map(({ source_refs: _s, review_status: _r, reviewer_note: _n, ...rest }) => rest);
  const payload = {
    analysis: {
      summary: analysis.summary,
      participants: analysis.participants,
      client_needs: strip(analysis.client_needs),
      requirements: strip(analysis.requirements),
      modules: analysis.modules,
      decisions: strip(analysis.decisions),
      commitments: strip(analysis.commitments),
      open_issues: strip(analysis.open_issues),
      tech_suggestions: strip(analysis.tech_suggestions),
      limitations: analysis.limitations,
    },
    estimates: est,
    vendor,
  };
  const base = JSON.stringify(payload, null, 2);
  return feedback ? `${base}\n\nCORREÇÃO NECESSÁRIA: ${feedback}` : base;
}

/**
 * Redige os textos da proposta. Só usa itens confirmed/edited (filtra de novo por segurança),
 * valida módulos e números e refaz uma vez se o texto violar as regras.
 */
export async function compose(
  analysisFiltered: MeetingAnalysis,
  estimates: ComposerEstimates,
  vendorProfile: VendorProfileInput,
): Promise<ProposalTextOutput> {
  const analysis = filterReviewed(analysisFiltered);
  const prompt = loadPrompt("compose_proposal");
  let feedback: string | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data } = await structuredCompletion({
      prompt,
      input: buildInput(analysis, estimates, vendorProfile, feedback),
      schema: ProposalTextOutput,
      schemaName: "proposal_text",
      attempt,
    });
    try {
      assertModulesMatch(data, analysis);
      assertNumbersUnchanged(data, estimates);
      return data;
    } catch (e) {
      if (!(e instanceof AiOutputInvalidError)) throw e;
      lastError = e;
      feedback = `${e.message}. Reescreva sem citar números de horas, semanas ou valores que não estejam em "estimates", e com exatamente os módulos de "analysis.modules".`;
    }
  }
  throw lastError;
}
