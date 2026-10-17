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

const MB = 1024 * 1024;
/** Limite real da API de transcrição da OpenAI; MAX_UPLOAD_MB maior que isso é reduzido a 25. */
export const OPENAI_MAX_UPLOAD_MB = 25;

/** MAX_UPLOAD_MB inválido (não numérico, <= 0): erro de configuração, nunca um fallback silencioso. */
export class UploadConfigError extends Error {
  readonly code = "UPLOAD_CONFIG_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "UploadConfigError";
  }
}

function maxUploadBytes(): number {
  const raw = process.env.MAX_UPLOAD_MB?.trim();
  if (!raw) return OPENAI_MAX_UPLOAD_MB * MB;
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) {
    throw new UploadConfigError(`MAX_UPLOAD_MB inválido ("${raw}"): informe um número maior que 0 (máximo efetivo ${OPENAI_MAX_UPLOAD_MB})`);
  }
  return Math.min(mb, OPENAI_MAX_UPLOAD_MB) * MB;
}

const segId = (i: number) => `s${String(i + 1).padStart(3, "0")}`;

// Abreviações que terminam em "." sem encerrar a frase ("Sr. Silva", "Dra. Ana", "Ltda. e").
const ABBREVIATIONS = new Set([
  "sr", "sra", "srs", "sras", "srta", "dr", "dra", "drs", "prof", "profa", "eng", "arq", "av", "ex", "exa", "exmo",
  "tel", "cel", "ltda", "cia", "vs", "pág", "pag", "fig", "obs", "art", "cap", "vol", "jr", "mr", "mrs", "ms", "inc", "st",
]);
const SENTENCE_END = /([.!?…]+)(["')\]]*)(?=\s|$)/gu;

/**
 * Divide em frases (. ! ? …) mantendo a pontuação; ignora pedaços vazios. Só é fim de frase a
 * pontuação seguida de espaço ou fim do texto, então "R$ 1.500,00", "3.5", "www.site.com.br" e
 * e-mails não quebram. Não quebra após abreviações comuns (Sr., Dra., Prof., ...), iniciais
 * ("J. Souza": letra maiúscula isolada seguida de palavra capitalizada) nem numeração de lista ("1. ").
 * Limitação: "plano B. Depois" é lido como inicial e não quebra.
 */
export function splitSentences(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let start = 0;
  for (const m of t.matchAll(SENTENCE_END)) {
    const end = m.index! + m[0].length;
    if (m[1] === ".") {
      const before = t.slice(start, m.index!);
      const word = /([\p{L}]+)$/u.exec(before)?.[1];
      const next = t.slice(end).trimStart();
      if (word && ABBREVIATIONS.has(word.toLowerCase())) continue;
      if (word && word.length === 1 && /(^|\s)\p{Lu}$/u.test(before) && /^\p{Lu}/u.test(next)) continue;
      if (/^\d{1,2}$/.test(before.trim())) continue; // "1. Item"
    }
    out.push(t.slice(start, end).trim());
    start = end;
  }
  out.push(t.slice(start).trim());
  return out.filter(Boolean);
}

export async function transcribeAudio(filePath: string): Promise<Transcript> {
  const limit = maxUploadBytes(); // falha cedo se MAX_UPLOAD_MB for inválido
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

// "Nome: fala" — formatos aceitos: "Ana:", "Rafael Costa:", "Participante 1:", "Speaker 1:",
// "Ana (cliente):" e com timestamp antes ("[00:12] Ana:", "00:12 - Ana:"). O rótulo tem até 4 palavras
// e começa em maiúscula; o papel entre parênteses não entra no nome do falante.
const SPEAKER_LINE =
  /^(?:[[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?[\])]?\s*[-–—]?\s*)?(\p{Lu}[\p{L}\d.'-]*(?: [\p{L}\d.'-]+){0,3})(?: \([^)]{1,30}\))?:\s+(\S.*)$/u;

// Rótulos de anotação que parecem falante ("Importante: ...") mas não são.
const NOT_SPEAKERS = new Set([
  "importante", "obs", "observação", "observações", "nota", "notas", "atenção", "resumo", "pauta", "assunto", "prazo",
  "objetivo", "objetivos", "ação", "ações", "tarefa", "tarefas", "decisão", "decisões", "pendência", "pendências",
  "exemplo", "contexto", "dúvida", "dúvidas", "ps", "note", "notes", "todo", "action", "summary", "agenda", "topic",
]);

/**
 * Um rótulo só vira falante se aparecer em >= 2 linhas (e não for rótulo de anotação). Assim
 * "Importante: ..." ou "Prazo: ..." isolados continuam sendo fala/texto. Limitação: quem fala uma
 * única vez numa transcrição sem outras linhas rotuladas não é reconhecido como falante.
 */
function parseSpeakerLines(lines: string[]): (RegExpExecArray | null)[] {
  const parsed = lines.map((l) => SPEAKER_LINE.exec(l));
  const counts = new Map<string, number>();
  for (const m of parsed) if (m) counts.set(m[1]!.toLowerCase(), (counts.get(m[1]!.toLowerCase()) ?? 0) + 1);
  return parsed.map((m) => (m && counts.get(m[1]!.toLowerCase())! >= 2 && !NOT_SPEAKERS.has(m[1]!.toLowerCase()) ? m : null));
}

export function fromText(text: string): Transcript {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed = parseSpeakerLines(lines);
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
