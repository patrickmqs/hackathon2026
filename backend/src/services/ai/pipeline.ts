import type { MeetingAnalysis } from "../../schemas/analysis.js";

// Contrato do pipeline de IA — o ponto de extensão entre o orquestrador (B5) e a
// implementação real da OpenAI (A5 transcrição, A9 extração). O stub (demo/testes)
// implementa esta mesma interface de forma determinística e sem I/O.

export interface TranscriptResult {
  text: string;
  segments: unknown;
  metadata: unknown;
}

export interface AnalyzeOptions {
  meetingId: string;
  language: string | null;
  sourceType: "text" | "audio";
}

export interface AiPipeline {
  // `filename` (opcional) preserva a extensão do áudio, usada para validar o formato.
  transcribe(audio: Buffer, options: { language: string | null; filename?: string }): Promise<TranscriptResult>;
  analyze(transcriptText: string, options: AnalyzeOptions): Promise<MeetingAnalysis>;
}
