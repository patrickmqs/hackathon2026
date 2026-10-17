// Compara modelos de transcrição no mesmo áudio: WER contra o texto-verdade, latência,
// segmentos com tempo e falantes. Uso: npm run bench:transcribe -- <audio.mp3> [dirSaida]
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const audio = path.resolve(process.argv[2] ?? "../sample_data/sample_meeting.mp3");
const outDir = path.resolve(process.argv[3] ?? ".");
const truthPath = path.resolve(import.meta.dirname, "../sample_data/sample_transcript_pt.txt");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 600_000 });

const truth = fs.readFileSync(truthPath, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.slice(l.indexOf(": ") + 2)).join(" ");

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

function wer(ref: string[], hyp: string[]): number {
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[hyp.length]! / ref.length;
}

type Cfg = { model: string; extra: Record<string, unknown> };
const MODELS: Cfg[] = [
  { model: "whisper-1", extra: { response_format: "verbose_json", timestamp_granularities: ["segment"], language: "pt" } },
  { model: "gpt-4o-transcribe", extra: { response_format: "json", language: "pt" } },
  { model: "gpt-4o-mini-transcribe", extra: { response_format: "json", language: "pt" } },
  { model: "gpt-4o-transcribe-diarize", extra: { response_format: "diarized_json", chunking_strategy: "auto" } },
  { model: "gpt-transcribe", extra: { response_format: "json", language: "pt" } },
];

const refWords = norm(truth);
console.log(`áudio: ${audio}\nreferência: ${refWords.length} palavras\n`);
console.log("modelo".padEnd(28), "WER".padEnd(8), "tempo".padEnd(8), "segm.".padEnd(7), "falantes");

for (const { model, extra } of MODELS) {
  const t0 = Date.now();
  try {
    const res = (await client.audio.transcriptions.create({
      file: fs.createReadStream(audio),
      model,
      ...extra,
    } as never)) as unknown as { text?: string; segments?: { speaker?: string; text: string }[] };
    const text = res.text ?? (res.segments ?? []).map((s) => s.text).join(" ");
    const speakers = new Set((res.segments ?? []).map((s) => s.speaker).filter(Boolean));
    const w = wer(refWords, norm(text));
    fs.writeFileSync(path.join(outDir, `bench_${model}.json`), JSON.stringify(res, null, 2));
    console.log(
      model.padEnd(28),
      `${(w * 100).toFixed(1)}%`.padEnd(8),
      `${((Date.now() - t0) / 1000).toFixed(0)}s`.padEnd(8),
      String(res.segments?.length ?? 0).padEnd(7),
      speakers.size ? [...speakers].join(",") : "-",
    );
  } catch (e) {
    console.log(model.padEnd(28), `FALHOU: ${(e as Error).message.split("\n")[0]}`);
  }
}
