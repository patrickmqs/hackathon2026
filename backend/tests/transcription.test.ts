import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/integrations/openai/client.js", () => ({ transcribe: vi.fn() }));
import { transcribe } from "../src/integrations/openai/client.js";
import { fromText, transcribeAudio } from "../src/services/transcription/service.js";

const mocked = vi.mocked(transcribe);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tr-"));
const file = (name: string, bytes = 10) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, Buffer.alloc(bytes));
  return p;
};

beforeEach(() => {
  mocked.mockReset();
  delete process.env.MAX_UPLOAD_MB;
});

describe("transcribeAudio", () => {
  it("sem segmentos: divide por frase, sem tempo", async () => {
    mocked.mockResolvedValue({ text: "Olá, pessoal. Vamos começar? Sim!", language: "pt", duration_ms: 5000, segments: [], model: "gpt-4o-transcribe" });
    const t = await transcribeAudio(file("a.mp3"));
    expect(t.segments.map((s) => s.id)).toEqual(["s001", "s002", "s003"]);
    expect(t.segments[0]).toMatchObject({ text: "Olá, pessoal.", start_ms: null, end_ms: null, speaker: null });
    expect(t.metadata).toEqual({ language: "pt", duration_ms: 5000, has_speakers: false, has_timestamps: false, provider: "openai", model: "gpt-4o-transcribe" });
  });

  it("com segmentos: mantém tempo", async () => {
    mocked.mockResolvedValue({ text: "a b", language: "pt", duration_ms: 2000, model: "whisper-1", segments: [{ id: 0, start_ms: 0, end_ms: 900, text: "a" }, { id: 1, start_ms: 900, end_ms: 2000, text: "b" }] });
    const t = await transcribeAudio(file("a.WAV"));
    expect(t.segments[1]).toMatchObject({ id: "s002", start_ms: 900, end_ms: 2000 });
    expect(t.metadata.has_timestamps).toBe(true);
  });

  it("rejeita extensão inválida e arquivo grande, sem chamar o modelo", async () => {
    await expect(transcribeAudio(file("a.txt"))).rejects.toMatchObject({ code: "UPLOAD_INVALID" });
    process.env.MAX_UPLOAD_MB = "1";
    await expect(transcribeAudio(file("big.mp3", 1024 * 1024 + 1))).rejects.toMatchObject({ code: "UPLOAD_INVALID" });
    await expect(transcribeAudio(path.join(tmp, "nao-existe.mp3"))).rejects.toMatchObject({ code: "UPLOAD_INVALID" });
    expect(mocked).not.toHaveBeenCalled();
  });
});

describe("fromText", () => {
  it("detecta falantes em 'Nome: fala'", () => {
    const sample = fs.readFileSync(path.resolve(import.meta.dirname, "../../sample_data/sample_transcript_pt.txt"), "utf8");
    const t = fromText(sample);
    expect(t.metadata).toMatchObject({ has_speakers: true, has_timestamps: false, provider: "text", model: null });
    expect(t.segments[0]).toMatchObject({ id: "s001", speaker: "Rafael Costa" });
    expect(new Set(t.segments.map((s) => s.speaker))).toEqual(new Set(["Rafael Costa", "Ana Souza", "Carlos Lima", "Marina Alves"]));
    expect(t.segments[0]!.text.startsWith("Pessoal, bom dia")).toBe(true);
  });

  it("texto sem rótulos: frases, sem falantes", () => {
    const t = fromText("O cliente quer um portal. Prazo: três meses, no máximo.");
    expect(t.metadata.has_speakers).toBe(false);
    expect(t.segments.every((s) => s.speaker === null)).toBe(true);
    expect(t.segments.length).toBe(2);
  });

  it("texto vazio não quebra", () => {
    expect(fromText("").segments).toEqual([]);
  });
});
