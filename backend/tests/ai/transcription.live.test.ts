// Teste ao vivo (1 chamada real). Rode com AI_TESTS=1 e OPENAI_API_KEY.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { transcribeAudio } from "../../src/services/transcription/service.js";

const audioPath =
  process.env.SAMPLE_AUDIO ?? "C:/Users/savio.conceicao/Documents/proposal-ai/sample_data/sample_meeting.mp3";
const enabled = process.env.AI_TESTS === "1" && fs.existsSync(audioPath);

describe.skipIf(!enabled)("transcrição ao vivo", () => {
  it("transcreve sample_meeting.mp3", async () => {
    const t = await transcribeAudio(audioPath);
    expect(t.metadata.provider).toBe("openai");
    expect(t.metadata.model).toBeTruthy();
    expect(t.segments.length).toBeGreaterThan(10);
    expect(t.text.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(1200);
  }, 300_000);
});
