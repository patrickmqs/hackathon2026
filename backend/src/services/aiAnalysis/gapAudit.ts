// Etapa 5 — auditoria de lacunas (docs/AI_PIPELINE.md §2, §5, §7). LLM #2.
import {
  GapAuditOutput,
  type ExtractionOutput,
  type GapAuditOutput as GapAudit,
} from "../../../../shared/src/schemas/analysis.js";
import { structuredCompletion, type Usage } from "../../integrations/openai/client.js";
import type { Transcript } from "../transcription/types.js";
import { loadPrompt, promptId } from "./prompts/loader.js";

/** Transcrição como entrada do LLM: com segmentos, uma linha por segmento; senão, o texto bruto. */
export function renderTranscript(transcript: Transcript): string {
  if (transcript.segments.length === 0) return transcript.text;
  return transcript.segments
    .map((s) => `[${s.id}] ${s.speaker ? `${s.speaker}: ` : ""}${s.text}`)
    .join("\n");
}

export interface GapAuditOptions {
  model?: string;
  attempt?: number;
  /** Violações da tentativa anterior, anexadas para o modelo corrigir (repair). */
  feedback?: string;
}

export interface GapAuditResult {
  data: GapAudit;
  promptVersion: string; // "gap_audit@1.0"
  usage: Usage;
  latencyMs: number;
}

export async function gapAuditDetailed(
  transcript: Transcript,
  extraction: ExtractionOutput,
  opts: GapAuditOptions = {},
): Promise<GapAuditResult> {
  const prompt = loadPrompt("gap_audit");
  let input =
    `## Transcrição\n\n${renderTranscript(transcript)}\n\n` +
    `## Extração a auditar (JSON)\n\n${JSON.stringify(extraction, null, 1)}`;
  if (opts.feedback) input += `\n\n## Correções exigidas\n\nSua resposta anterior violou estas regras; corrija mantendo o restante:\n${opts.feedback}`;
  const { data, usage, latencyMs } = await structuredCompletion({
    prompt,
    input,
    schema: GapAuditOutput,
    schemaName: "gap_audit",
    attempt: opts.attempt,
    model: opts.model,
  });
  return { data, promptVersion: promptId(prompt), usage, latencyMs };
}

export async function gapAudit(
  transcript: Transcript,
  extraction: ExtractionOutput,
  opts: GapAuditOptions = {},
): Promise<GapAudit> {
  return (await gapAuditDetailed(transcript, extraction, opts)).data;
}
