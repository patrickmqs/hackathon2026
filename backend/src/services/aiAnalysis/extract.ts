// Etapa 3 — extração estruturada (docs/AI_PIPELINE.md §2, §5). Uma chamada ao LLM; validação e
// retry/repair ficam no orquestrador (validators.ts + repair.md).
import { ExtractionOutput } from "../../../../shared/src/schemas/analysis.js";
import { structuredCompletion } from "../../integrations/openai/client.js";
import type { Transcript } from "../transcription/types.js";
import { loadPrompt } from "./prompts/loader.js";

/** Monta o conteúdo do usuário: texto integral e, se houver, segmentos com id (e tempo/falante). */
export function buildExtractInput(transcript: Transcript): string {
  const m = transcript.metadata;
  const parts = [
    `Idioma: ${m.language ?? "não informado"}`,
    `Falantes identificados na transcrição: ${m.has_speakers ? "sim" : "não"}`,
    "",
    "=== TRANSCRIÇÃO ===",
    transcript.text,
  ];
  if (transcript.segments.length > 0) {
    parts.push("", "=== SEGMENTOS ===");
    for (const s of transcript.segments) {
      const time = s.start_ms != null ? ` t=${s.start_ms}ms` : "";
      const who = s.speaker ? ` ${s.speaker}:` : "";
      parts.push(`[${s.id}${time}]${who} ${s.text}`);
    }
  }
  return parts.join("\n");
}

export async function extract(transcript: Transcript): Promise<ExtractionOutput> {
  const prompt = loadPrompt("extract");
  const { data } = await structuredCompletion({
    prompt,
    input: buildExtractInput(transcript),
    schema: ExtractionOutput,
    schemaName: "extraction",
  });
  return data;
}
