import type { MeetingAnalysis } from "../../schemas/analysis.js";
import type { ProposalContent } from "../../schemas/proposal.js";
import type { ComposerEstimates, ProposalTextOutput, VendorProfileInput } from "./composer.js";

// Etapa de composição de texto (AI_PIPELINE §8, LLM #3), aplicada DEPOIS do builder determinístico.
// A IA só redige os campos textuais; estimativas, equipe, cronograma, valores, cliente, fornecedor e meta
// vêm do builder e nunca são alterados aqui. Se a IA falhar, a proposta segue com o texto determinístico.

export type ProposalComposer = (
  analysis: MeetingAnalysis,
  estimates: ComposerEstimates,
  vendor: VendorProfileInput,
) => Promise<ProposalTextOutput>;

export interface ComposeStepResult {
  content: ProposalContent;
  composed: boolean;
  warning: string | null;
}

/** Formato que o composer espera: estimativas aninhadas e `rationale` por linha (ainda nulo). */
export function toComposerEstimates(content: ProposalContent): ComposerEstimates {
  return {
    estimates: {
      method: content.estimates.method,
      basis_label: content.estimates.basis_label,
      lines: content.estimates.lines.map((l) => ({
        module_id: l.module_id,
        profile: l.profile,
        hours_min: l.hours_min,
        hours_max: l.hours_max,
        rationale: (l as { rationale?: string | null }).rationale ?? null,
      })),
      totals_by_profile: content.estimates.totals_by_profile,
      total_hours_min: content.estimates.total_hours_min,
      total_hours_max: content.estimates.total_hours_max,
      confidence: content.estimates.confidence,
      assumptions: content.estimates.assumptions,
    },
    team: content.team,
    schedule: content.schedule,
    total_weeks: content.total_weeks,
    commercial: content.commercial,
  };
}

/** Troca só os campos textuais de `content` pelos do texto redigido. Não toca em nenhum número. */
export function mergeComposedText(content: ProposalContent, text: ProposalTextOutput): ProposalContent {
  const byId = new Map(text.modules.map((m) => [m.id, m]));
  return {
    ...content,
    title: text.title || content.title,
    executive_summary: text.executive_summary,
    business_context: text.business_context,
    objectives: text.objectives,
    scope: text.scope,
    modules: content.modules.map((m) => {
      const t = byId.get(m.id);
      return t ? { ...m, description: t.description, features: t.features } : m;
    }),
    requirements_and_integrations: text.requirements_and_integrations as ProposalContent["requirements_and_integrations"],
    architecture: { ...text.architecture, is_ai_suggestion: true },
    assumptions: text.assumptions,
    dependencies: text.dependencies,
    exclusions: text.exclusions,
    risks: text.risks,
    open_points: text.open_points,
    next_steps: text.next_steps,
  };
}

export async function applyComposedText(
  content: ProposalContent,
  analysis: MeetingAnalysis,
  composer: ProposalComposer,
): Promise<ComposeStepResult> {
  try {
    const text = await composer(analysis, toComposerEstimates(content), content.vendor);
    return { content: mergeComposedText(content, text), composed: true, warning: null };
  } catch (e) {
    return {
      content,
      composed: false,
      warning: `Texto da proposta não redigido pela IA (mantido o texto determinístico): ${(e as Error).message}`,
    };
  }
}
