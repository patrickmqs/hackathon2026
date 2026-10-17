import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/integrations/openai/client.js", () => ({ transcribe: vi.fn() }));
import { transcribe } from "../src/integrations/openai/client.js";
import { fromText, splitSentences, transcribeAudio } from "../src/services/transcription/service.js";

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

describe("revisão C: splitSentences", () => {
  it("não quebra em valores, abreviações nem URLs", () => {
    expect(splitSentences("O valor é R$ 1.500,00 por mês. Falei com o Sr. Silva ontem. Veja www.site.com.br para detalhes.")).toEqual([
      "O valor é R$ 1.500,00 por mês.",
      "Falei com o Sr. Silva ontem.",
      "Veja www.site.com.br para detalhes.",
    ]);
    expect(splitSentences("A Dra. Ana e o Prof. Lima, J. Souza e outros. Fim!")).toEqual(["A Dra. Ana e o Prof. Lima, J. Souza e outros.", "Fim!"]);
  });

  it("ponto sem espaço depois (decimal, domínio, e-mail) não separa", () => {
    expect(splitSentences("São 3.5 horas, escreva para ana@empresa.com.br. Certo?")).toEqual(["São 3.5 horas, escreva para ana@empresa.com.br.", "Certo?"]);
  });

  it("mantém o comportamento básico", () => {
    expect(splitSentences("Olá, pessoal. Vamos começar? Sim!")).toEqual(["Olá, pessoal.", "Vamos começar?", "Sim!"]);
    expect(splitSentences("sem pontuação final")).toEqual(["sem pontuação final"]);
  });
});

describe("revisão C: rótulos de falante", () => {
  const speakers = (t: string) => fromText(t).segments.map((s) => s.speaker);

  it("aceita Participante 1, Speaker 1, 'Nome (papel)' e timestamp", () => {
    expect(speakers("Participante 1: Bom dia.\nParticipante 2: Oi.\nParticipante 1: Vamos.\nParticipante 2: Ok.")).toEqual(["Participante 1", "Participante 2", "Participante 1", "Participante 2"]);
    expect(speakers("Speaker 1: Hello.\nSpeaker 2: Hi.\nSpeaker 1: Go.\nSpeaker 2: Ok.")).toEqual(["Speaker 1", "Speaker 2", "Speaker 1", "Speaker 2"]);
    expect(speakers("Ana (cliente): Bom dia.\nBruno: Oi.\nAna (cliente): Vamos.\nBruno: Ok.")).toEqual(["Ana", "Bruno", "Ana", "Bruno"]);
    const t = fromText("[00:12] Ana: Bom dia.\n[00:20] Bruno: Oi.\n[00:31] Ana: Vamos.\n[00:40] Bruno: Ok.");
    expect(t.segments.map((s) => s.speaker)).toEqual(["Ana", "Bruno", "Ana", "Bruno"]);
    expect(t.segments[0]!.text).toBe("Bom dia.");
  });

  it("'Importante:', 'Obs:' e rótulos que aparecem uma vez não viram falante", () => {
    const t = fromText("Importante: o cliente quer um portal.\nObs: prazo curto.\nResumo: foi uma boa reunião.");
    expect(t.metadata.has_speakers).toBe(false);
    expect(t.segments.every((s) => s.speaker === null)).toBe(true);
    // mistura: só o rótulo repetido é falante
    const m = fromText("Ana: Oi.\nImportante: pagar até sexta.\nAna: Certo.\nBruno: Ok.\nBruno: Fechado.");
    expect(m.segments.map((s) => s.speaker)).toEqual(["Ana", "Ana", "Ana", "Bruno", "Bruno"]);
    expect(m.segments[1]!.text).toBe("Importante: pagar até sexta.");
  });

  it("rótulo com mais de 4 palavras não é falante", () => {
    expect(fromText("Esta frase tem muitas palavras: x\nEsta frase tem muitas palavras: y").metadata.has_speakers).toBe(false);
  });
});

describe("revisão C: MAX_UPLOAD_MB", () => {
  it("valor acima de 25 é limitado a 25 MB (limite real da OpenAI)", async () => {
    process.env.MAX_UPLOAD_MB = "100";
    await expect(transcribeAudio(file("grande.mp3", 26 * 1024 * 1024))).rejects.toMatchObject({ code: "UPLOAD_INVALID" });
    expect(mocked).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "-5", "NaN"])("valor inválido %s falha com erro claro", async (v) => {
    process.env.MAX_UPLOAD_MB = v;
    await expect(transcribeAudio(file("a.mp3"))).rejects.toThrow(/MAX_UPLOAD_MB/);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("vazio/ausente usa 25 MB", async () => {
    process.env.MAX_UPLOAD_MB = "";
    mocked.mockResolvedValue({ text: "oi", language: "pt", duration_ms: 1, segments: [], model: "m" });
    await expect(transcribeAudio(file("a.mp3"))).resolves.toBeDefined();
  });
});
