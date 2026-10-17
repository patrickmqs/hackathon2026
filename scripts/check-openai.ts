// IA1 — valida quais modelos da OpenAI a chave atual consegue usar.
// Uso: copie ../.env.example para ../.env, preencha OPENAI_API_KEY e rode `npm run check:openai`.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY ausente. Defina no .env da raiz.");
  process.exit(1);
}
const client = new OpenAI({ apiKey });

const chatCandidates = unique([process.env.OPENAI_MODEL, "gpt-4.1", "gpt-4o", "gpt-4o-mini"]);
const transcribeCandidates = unique([
  process.env.OPENAI_TRANSCRIBE_MODEL,
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "whisper-1",
]);

function unique(xs: (string | undefined)[]): string[] {
  return [...new Set(xs.filter((x): x is string => !!x))];
}

// 1 s de silêncio PCM 16 kHz mono — basta para provar acesso ao modelo.
function silentWav(seconds = 1): File {
  const rate = 16000;
  const data = Buffer.alloc(rate * 2 * seconds);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return new File([Buffer.concat([h, data])], "silence.wav", { type: "audio/wav" });
}

const Probe = z.object({ ok: z.boolean(), items: z.array(z.object({ id: z.string(), label: z.string().nullable() })) });

async function checkChat(model: string): Promise<string> {
  try {
    const r = await client.responses.parse({
      model,
      input: 'Devolva ok=true e dois itens com id "a" e "b"; label null no primeiro e "x" no segundo.',
      text: { format: zodTextFormat(Probe, "probe") },
    });
    return r.output_parsed?.ok ? "OK (structured outputs)" : "respondeu, mas output_parsed vazio";
  } catch (e) {
    return `FALHOU: ${(e as Error).message.split("\n")[0]}`;
  }
}

async function checkTranscribe(model: string): Promise<string> {
  const base = { file: silentWav(), model };
  try {
    await client.audio.transcriptions.create({
      ...base, response_format: "verbose_json", timestamp_granularities: ["segment"],
    } as never);
    return "OK (verbose_json + segmentos)";
  } catch (e1) {
    try {
      await client.audio.transcriptions.create({ ...base, response_format: "json" });
      return "OK (só json, sem segmentos/timestamps)";
    } catch (e2) {
      return `FALHOU: ${(e2 as Error).message.split("\n")[0]}`;
    }
  }
}

console.log("== Chat / Structured Outputs ==");
const chat: Record<string, string> = {};
for (const m of chatCandidates) { chat[m] = await checkChat(m); console.log(`${m.padEnd(26)} ${chat[m]}`); }
console.log("\n== Transcrição ==");
const tr: Record<string, string> = {};
for (const m of transcribeCandidates) { tr[m] = await checkTranscribe(m); console.log(`${m.padEnd(26)} ${tr[m]}`); }

const okChat = chatCandidates.find((m) => chat[m].startsWith("OK"));
const okTr = transcribeCandidates.find((m) => tr[m].startsWith("OK"));
console.log("\nSugestão para o .env:");
console.log(`OPENAI_MODEL=${okChat ?? "<nenhum modelo funcionou>"}`);
console.log(`OPENAI_TRANSCRIBE_MODEL=${okTr ?? "<nenhum modelo funcionou>"}`);
process.exit(okChat && okTr ? 0 : 1);
