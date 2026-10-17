// Contrato da transcrição (docs/API_SPEC.md §4.3). Entrada do pipeline de análise.
export interface TranscriptSegment {
  id: string; // "s001"
  start_ms: number | null; // null quando o modelo não devolve tempo
  end_ms: number | null;
  speaker: string | null; // como aparece na transcrição; null se desconhecido
  text: string;
}

export interface TranscriptMetadata {
  language: string | null;
  duration_ms: number | null;
  has_speakers: boolean;
  has_timestamps: boolean;
  provider: "openai" | "text"; // "text" = transcrição colada, sem chamada de IA
  model: string | null;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[]; // pode ser [] (texto sem marcação)
  metadata: TranscriptMetadata;
}
