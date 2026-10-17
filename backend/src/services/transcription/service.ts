// Serviço de transcrição (AI_PIPELINE §2, API_SPEC §4.3): áudio -> Transcript, ou texto colado -> Transcript.
import fs from "node:fs";
import path from "node:path";
import { transcribe } from "../../integrations/openai/client.js";
import type { Transcript, TranscriptSegment } from "./types.js";

export const ALLOWED_AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".webm", ".mp4"] as const;

export class UploadInvalidError extends Error {
  readonly code = "UPLOAD_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "UploadInvalidError";
  }
}

function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
}

const segId = (i: number) => `s${String(i + 1).padStart(3, "0")}`;

/** Divide em frases (. ! ? …) mantendo a pontuação; ignora pedaços vazios. */
export function splitSentences(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g) ?? [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

export async function transcribeAudio(filePath: string): Promise<Transcript> {
  const ext = path.extname(filePath).toLowerCase();
  if (!(ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new UploadInvalidError(`Extensão não permitida: ${ext || "(nenhuma)"}`);
  }
  let size: number;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    throw new UploadInvalidError("Arquivo de áudio não encontrado");
  }
  if (size > maxUploadBytes()) {
    throw new UploadInvalidError("Arquivo maior que o limite MAX_UPLOAD_MB");
  }

  const res = await transcribe({ filePath });
  const withTime = res.segments.length > 0;
  const segments: TranscriptSegment[] = withTime
    ? res.segments.map((s, i) => ({
        id: segId(i),
        start_ms: s.start_ms,
        end_ms: s.end_ms,
        speaker: null,
        text: s.text,
      }))
    : splitSentences(res.text).map((text, i) => ({
        id: segId(i),
        start_ms: null,
        end_ms: null,
        speaker: null,
        text,
      }));

  return {
    text: res.text,
    segments,
    metadata: {
      language: res.language,
      duration_ms: res.duration_ms,
      has_speakers: false,
      has_timestamps: withTime,
      provider: "openai",
      model: res.model,
    },
  };
}

// "Nome: fala" — nome curto (até 4 palavras) iniciado em maiúscula, seguido de dois-pontos.
const SPEAKER_LINE = /^([A-ZÀ-Ý][\p{L}.'-]*(?: [\p{L}.'-]+){0,3}):\s+(\S.*)$/u;

export function fromText(text: string): Transcript {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((l) => SPEAKER_LINE.exec(l));
  const labeled = parsed.filter(Boolean).length;
  const hasSpeakers = lines.length > 0 && labeled / lines.length >= 0.5;

  let segments: TranscriptSegment[];
  if (hasSpeakers) {
    let current: string | null = null;
    segments = lines.map((line, i) => {
      const m = parsed[i];
      if (m) current = m[1]!;
      return { id: segId(i), start_ms: null, end_ms: null, speaker: current, text: m ? m[2]! : line };
    });
  } else {
    segments = splitSentences(text).map((t, i) => ({ id: segId(i), start_ms: null, end_ms: null, speaker: null, text: t }));
  }

  return {
    text,
    segments,
    metadata: {
      language: null,
      duration_ms: null,
      has_speakers: hasSpeakers,
      has_timestamps: false,
      provider: "text",
      model: null,
    },
  };
}
