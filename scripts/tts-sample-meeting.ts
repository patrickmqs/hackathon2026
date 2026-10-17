// Gera o áudio da reunião fictícia a partir de sample_data/sample_transcript_pt.txt,
// uma voz por participante (TTS). Saída rotulada como DEMONSTRAÇÃO (voz sintética).
// Uso: npm run tts:sample -- [saida.mp3] [maxLinhas]
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const out = path.resolve(process.argv[2] ?? "../sample_data/sample_meeting.mp3");
const maxLines = Number(process.argv[3] ?? Infinity);
const transcriptPath = path.resolve(import.meta.dirname, "../sample_data/sample_transcript_pt.txt");

const VOICES: Record<string, string> = {
  "Ana Souza": "coral",
  "Carlos Lima": "onyx",
  "Marina Alves": "nova",
  "Rafael Costa": "ash",
};
const INSTRUCTIONS =
  "Fale em português do Brasil, em tom natural de reunião de negócios por videochamada, ritmo conversacional, sem exagero de entonação.";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const lines = fs
  .readFileSync(transcriptPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .slice(0, maxLines)
  .map((l) => {
    const i = l.indexOf(": ");
    return { speaker: l.slice(0, i), text: l.slice(i + 2) };
  });

async function speak(text: string, voice: string): Promise<Buffer> {
  const res = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
    instructions: INSTRUCTIONS,
    response_format: "mp3",
  });
  return Buffer.from(await res.arrayBuffer());
}

const parts: Buffer[] = new Array(lines.length);
let next = 0;
async function worker() {
  while (next < lines.length) {
    const i = next++;
    const voice = VOICES[lines[i]!.speaker];
    if (!voice) throw new Error(`Falante sem voz mapeada: ${lines[i]!.speaker}`);
    parts[i] = await speak(lines[i]!.text, voice);
    process.stdout.write(`\r${i + 1}/${lines.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat(parts)); // concatenar mp3 é válido para o decodificador
console.log(`\n${lines.length} falas -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
