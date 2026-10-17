import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transcribeAudio = vi.fn();
const analyzeMeeting = vi.fn();
vi.mock("../../../src/services/transcription/service.js", async (orig) => ({
  ...(await orig<typeof import("../../../src/services/transcription/service.js")>()),
  transcribeAudio: (p: string) => transcribeAudio(p),
}));
vi.mock("../../../src/services/aiAnalysis/pipeline.js", () => ({ analyzeMeeting: (...a: unknown[]) => analyzeMeeting(...a) }));

const { OpenAiPipeline } = await import("../../../src/services/ai/openai.js");

beforeEach(() => {
  transcribeAudio.mockReset();
  analyzeMeeting.mockReset();
});

describe("OpenAiPipeline", () => {
  it("transcribe: grava o buffer com a extensão do arquivo, delega e remove o temporário", async () => {
    let seen = "";
    transcribeAudio.mockImplementation(async (p: string) => {
      seen = p;
      expect(fs.readFileSync(p).toString()).toBe("audio-bytes");
      return { text: "olá", segments: [{ id: "s001" }], metadata: { provider: "openai" } };
    });
    const r = await new OpenAiPipeline().transcribe(Buffer.from("audio-bytes"), { language: null, filename: "storage/audio/m1.m4a" });
    expect(seen.endsWith(".m4a")).toBe(true);
    expect(r).toEqual({ text: "olá", segments: [{ id: "s001" }], metadata: { provider: "openai" } });
    expect(fs.existsSync(seen)).toBe(false);
  });

  it("transcribe: remove o temporário mesmo quando a transcrição falha", async () => {
    let seen = "";
    transcribeAudio.mockImplementation(async (p: string) => {
      seen = p;
      throw new Error("falhou");
    });
    await expect(new OpenAiPipeline().transcribe(Buffer.from("x"), { language: null, filename: "a.wav" })).rejects.toThrow("falhou");
    expect(fs.existsSync(seen)).toBe(false);
  });

  it("analyze: monta a transcrição a partir do texto e usa o id da reunião", async () => {
    analyzeMeeting.mockResolvedValue({ meeting_id: "m1", meeting_summary: null });
    const out = await new OpenAiPipeline().analyze("Ana: oi. Ana: tchau.", { meetingId: "m1", language: null, sourceType: "audio" });
    const [transcript, meetingId] = analyzeMeeting.mock.calls[0]!;
    expect(meetingId).toBe("m1");
    expect(transcript.text).toContain("Ana: oi");
    expect(transcript.segments.length).toBeGreaterThan(0);
    expect(out).toEqual({ meeting_id: "m1", meeting_summary: null });
  });
});
