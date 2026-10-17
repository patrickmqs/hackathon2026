// Etapa 5b — resumo da reunião (docs/AI_PIPELINE.md §3, §5, §6.2). LLM #2b.
// Derivado da análise já validada: referencia itens por id e nunca os promove.
import { MeetingSummaryOutput } from "../../../../shared/src/schemas/analysis.js";
import { AiOutputInvalidError } from "../../core/errors.js";
import { structuredCompletion, type Usage } from "../../integrations/openai/client.js";
import type { Transcript } from "../transcription/types.js";
import { renderTranscript } from "./gapAudit.js";
import { loadPrompt, promptId } from "./prompts/loader.js";
import { validateSummary, type SummaryAnalysis, type SummaryBasis } from "./summaryValidator.js";

export const SUMMARY_MAX_ATTEMPTS = 3;

export interface SummarizeOptions {
  model?: string;
  maxAttempts?: number;
}

export interface SummarizeResult {
  summary: MeetingSummaryOutput;
  /** Correções automáticas do validador; o orquestrador as acrescenta a `limitations[]`. */
  limitations: string[];
  promptVersion: string; // "summarize@1.0"
  attempts: number;
  usage: Usage;
}

const eligible = (status: string) => status === "confirmed" || status === "edited";

/** Visão enxuta da análise enviada ao modelo (sem source_refs); com basis=reviewed, só itens confirmed/edited. */
export function analysisForPrompt(analysis: SummaryAnalysis, basis: SummaryBasis) {
  const keep = <T extends { review_status: string }>(xs: T[]) => (basis === "reviewed" ? xs.filter((x) => eligible(x.review_status)) : xs);
  return {
    decisions: keep(analysis.decisions).map((d) => ({
      id: d.id, status: d.status, description: d.description, agreed_by: d.agreed_by,
    })),
    commitments: keep(analysis.commitments).map((c) => ({
      id: c.id, owner: c.owner, status: c.status, description: c.description, due_text: c.due_text, caveats: c.caveats,
    })),
    open_issues: keep(analysis.open_issues).map((i) => ({
      id: i.id, type: i.type, description: i.description, impact: i.impact,
    })),
    requirements: keep(analysis.requirements).map((r) => ({ id: r.id, title: r.title, description: r.description })),
    client_needs: keep(analysis.client_needs).map((n) => ({ id: n.id, category: n.category, description: n.description })),
    ai_suggestions_not_decisions: keep(analysis.tech_suggestions).map((t) => ({ id: t.id, description: t.description })),
  };
}

export async function summarizeDetailed(
  transcript: Transcript,
  analysis: SummaryAnalysis,
  basis: SummaryBasis,
  opts: SummarizeOptions = {},
): Promise<SummarizeResult> {
  const prompt = loadPrompt("summarize");
  const max = opts.maxAttempts ?? SUMMARY_MAX_ATTEMPTS;
  const base =
    `basis = ${basis}\n\n## Transcrição\n\n${renderTranscript(transcript)}\n\n` +
    `## Análise validada (JSON)\n\n${JSON.stringify(analysisForPrompt(analysis, basis), null, 1)}`;

  let feedback: string[] = [];
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  for (let attempt = 1; attempt <= max; attempt++) {
    const input = feedback.length
      ? `${base}\n\n## Correções exigidas\n\nSua resposta anterior violou estas regras; corrija mantendo o restante:\n${feedback.map((v) => `- ${v}`).join("\n")}`
      : base;
    const res = await structuredCompletion({ prompt, input, schema: MeetingSummaryOutput, schemaName: "meeting_summary", attempt, model: opts.model });
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    const v = validateSummary(res.data, { transcript, analysis, basis });
    if (v.ok) return { summary: v.summary, limitations: v.limitations, promptVersion: promptId(prompt), attempts: attempt, usage };
    feedback = v.violations;
  }
  throw new AiOutputInvalidError(`Resumo inválido após ${max} tentativas`, feedback);
}

export async function summarize(
  transcript: Transcript,
  analysis: SummaryAnalysis,
  basis: SummaryBasis,
  opts: SummarizeOptions = {},
): Promise<MeetingSummaryOutput> {
  return (await summarizeDetailed(transcript, analysis, basis, opts)).summary;
}
