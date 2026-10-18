// Orquestrador da análise (docs/AI_PIPELINE.md §2, §3, §6): extração -> validação -> auditoria ->
// validação -> rebaixamentos -> resumo obrigatório -> MeetingAnalysis.
import {
  ExtractionOutput,
  type GapAuditOutput,
  type MeetingAnalysis,
  type MeetingSummaryOutput,
} from "../../../../shared/src/schemas/analysis.js";
import { AiOutputInvalidError } from "../../core/errors.js";
import { structuredCompletion } from "../../integrations/openai/client.js";
import type { Transcript } from "../transcription/types.js";
import { buildExtractInput } from "./extract.js";
import { gapAuditDetailed } from "./gapAudit.js";
import { loadPrompt, promptId } from "./prompts/loader.js";
import { summarizeDetailed, type SummarizeResult } from "./summarize.js";
import { SUMMARY_LIMITS, openIssuePriority, validateSummary, type SummaryAnalysis } from "./summaryValidator.js";
import { validateExtraction, validateGapAudit } from "./validators.js";

export type PipelineStep = "extracting" | "auditing" | "summarizing";

export interface AnalyzeOptions {
  onProgress?: (step: PipelineStep) => void;
  model?: string;
}

/** Primeira tentativa + até 2 reenvios com repair (§6). */
export const MAX_ATTEMPTS = 3;

const errorsToText = (e: unknown): string => (typeof e === "string" ? e : JSON.stringify(e, null, 1));

/** Renderiza prompts/repair.md com os erros (e, se houver, a saída anterior). */
function repairSuffix(violations: string[], previous: unknown): string {
  const body = loadPrompt("repair").system;
  const prev = previous === undefined ? "" : `### Sua saída anterior (JSON)\n\n${JSON.stringify(previous, null, 1)}`;
  return body.replace("{{errors}}", violations.map((v) => `- ${v}`).join("\n")).replace("{{previous}}", prev).trim();
}

/**
 * Executa `run` até MAX_ATTEMPTS vezes. `check` devolve violações (vazio = ok). Erros de saída
 * inválida (AiOutputInvalidError) também geram novo envio; erros de provedor sobem direto.
 */
async function withRepair<T, R>(
  run: (feedback: string[], previous: unknown, attempt: number) => Promise<T>,
  check: (data: T) => { violations: string[]; result: R },
  label: string,
): Promise<R> {
  let violations: string[] = [];
  let previous: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let data: T;
    try {
      data = await run(violations, previous, attempt);
    } catch (e) {
      if (!(e instanceof AiOutputInvalidError)) throw e;
      violations = [`A saída não pôde ser lida: ${e.details != null ? errorsToText(e.details) : e.message}`];
      previous = undefined;
      continue;
    }
    const { violations: v, result } = check(data);
    if (v.length === 0) return result;
    violations = v;
    previous = data;
  }
  throw new AiOutputInvalidError(`${label} inválida após ${MAX_ATTEMPTS} tentativas`, violations);
}

/**
 * O resumo roda em paralelo à auditoria (sem ver os rebaixamentos nem as pendências dela). Antes de
 * validar, ajusta as listas de ids de forma determinística: decisões que a auditoria rebaixou saem de
 * `key_decisions` e vão para `pending_decisions`, e `open_points` passa a vir das pendências da auditoria.
 */
function reconcileSummary(summary: MeetingSummaryOutput, analysis: MeetingAnalysis): MeetingSummaryOutput {
  const demoted = new Set(analysis.decisions.filter((d) => d.status !== "confirmed").map((d) => d.id));
  const pending = [...summary.pending_decisions];
  for (const id of summary.key_decisions) if (demoted.has(id) && !pending.includes(id)) pending.push(id);
  const open_points = [...analysis.open_issues]
    .sort((a, b) => openIssuePriority(b) - openIssuePriority(a))
    .slice(0, SUMMARY_LIMITS.max_open_points)
    .map((i) => i.id);
  return {
    ...summary,
    key_decisions: summary.key_decisions.filter((id) => !demoted.has(id)),
    pending_decisions: pending,
    open_points,
  };
}

/** Aplica `downgrades` da auditoria. Nunca toca em itens já tentative/conditional/pending_validation. */
function applyAuditDowngrades(
  extraction: ExtractionOutput,
  downgrades: GapAuditOutput["downgrades"],
  limitations: string[],
) {
  for (const d of downgrades) {
    const dec = extraction.decisions.find((x) => x.id === d.id);
    if (dec) {
      if (dec.status === "confirmed") {
        dec.status = "pending_validation";
        limitations.push(`decisão ${dec.id} rebaixada para pending_validation pela auditoria: ${d.reason}`);
      }
      continue;
    }
    const com = extraction.commitments.find((x) => x.id === d.id);
    if (com && com.status === "confirmed") {
      com.status = "tentative";
      limitations.push(`compromisso ${com.id} rebaixado para tentative pela auditoria: ${d.reason}`);
    }
  }
}

export async function analyzeMeeting(
  transcript: Transcript,
  meetingId: string,
  opts: AnalyzeOptions = {},
): Promise<MeetingAnalysis> {
  const limitations: string[] = [];
  const model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1";

  // 1. Extração + validação
  opts.onProgress?.("extracting");
  const extractPrompt = loadPrompt("extract");
  const baseInput = buildExtractInput(transcript);
  const validated = await withRepair(
    async (feedback, previous, attempt) => {
      const input = feedback.length ? `${baseInput}\n\n${repairSuffix(feedback, previous)}` : baseInput;
      const res = await structuredCompletion({
        prompt: extractPrompt,
        input,
        schema: ExtractionOutput,
        schemaName: "extraction",
        attempt,
        model: opts.model,
      });
      return res.data;
    },
    (data) => {
      const v = validateExtraction(data, transcript);
      return { violations: v.reprocess, result: v };
    },
    "Extração",
  );
  const extraction = validated.extraction;
  limitations.push(...extraction.limitations, ...validated.limitations);
  extraction.limitations = [];

  // 2. Auditoria + validação. O resumo parte da extração e roda junto (economiza o tempo do resumo);
  // erros dele só são tratados depois, para não gerar rejeição solta se a auditoria falhar primeiro.
  opts.onProgress?.("auditing");
  const preAudit: SummaryAnalysis = { ...extraction, open_issues: [] };
  const summaryRun = summarizeDetailed(transcript, preAudit, "analysis", { model: opts.model }).then(
    (result) => ({ ok: true as const, result }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const gapPromptVersion = { value: "" };
  const audited = await withRepair(
    async (feedback, _previous, attempt) => {
      const res = await gapAuditDetailed(transcript, extraction, {
        model: opts.model,
        attempt,
        feedback: feedback.length ? feedback.map((v) => `- ${v}`).join("\n") : undefined,
      });
      gapPromptVersion.value = res.promptVersion;
      return res.data;
    },
    (data) => {
      const v = validateGapAudit(data, transcript, extraction);
      return { violations: v.reprocess, result: v };
    },
    "Auditoria",
  );
  limitations.push(...audited.audit.additional_limitations, ...audited.limitations);

  // 3. Rebaixamentos da auditoria
  applyAuditDowngrades(extraction, audited.audit.downgrades, limitations);

  const analysis: MeetingAnalysis = {
    ...extraction,
    limitations,
    meeting_id: meetingId,
    open_issues: audited.audit.open_issues,
    transcript_metadata: {
      language: transcript.metadata.language,
      duration_ms: transcript.metadata.duration_ms,
      has_speakers: transcript.metadata.has_speakers,
      has_timestamps: transcript.metadata.has_timestamps,
      source_type: transcript.metadata.provider === "openai" ? "audio" : "text",
    },
    meeting_summary: null,
    review_completed: false,
    meta: {
      schema_version: "1.0",
      prompt_version: `${promptId(extractPrompt)}+${gapPromptVersion.value}`,
      model,
      generated_at: new Date().toISOString(),
      reviewed_by: null,
      reviewed_at: null,
    },
  };

  // 4. Resumo obrigatório: usa o que rodou em paralelo, reconciliado com a auditoria e revalidado
  // (função pura). Se não passar, refaz em sequência com a análise final, como antes.
  opts.onProgress?.("summarizing");
  let s: Pick<SummarizeResult, "summary" | "limitations" | "promptVersion"> | null = null;
  const settled = await summaryRun;
  if (settled.ok) {
    const v = validateSummary(reconcileSummary(settled.result.summary, analysis), { transcript, analysis, basis: "analysis" });
    if (v.ok) s = { summary: v.summary, limitations: [...settled.result.limitations, ...v.limitations], promptVersion: settled.result.promptVersion };
  }
  if (!s) s = await summarizeDetailed(transcript, analysis, "analysis", { model: opts.model });
  analysis.meeting_summary = {
    ...s.summary,
    meta: { prompt_version: s.promptVersion, model, generated_at: new Date().toISOString(), basis: "analysis" },
  };
  analysis.limitations.push(...s.limitations);
  return analysis;
}
