import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiOutputInvalidError, AiProviderError } from "../../src/core/errors.js";
import { __setTestHooks, structuredCompletion, transcribe } from "../../src/integrations/openai/client.js";

const prompt = { name: "t", version: "1.0", system: "sys", temperature: 0.1 };
const schema = z.object({ ok: z.boolean() });
const sleeps: number[] = [];
let logFile: string;

function fake(parse: () => unknown, create?: () => unknown) {
  return { responses: { parse }, audio: { transcriptions: { create } } } as unknown as OpenAI;
}
const ok = () => ({ output_parsed: { ok: true }, usage: { input_tokens: 10, output_tokens: 5 }, output_text: "" });
const run = () => structuredCompletion({ prompt, input: "x", schema, schemaName: "probe" });

beforeEach(() => {
  sleeps.length = 0;
  logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "airuns-")), "ai_runs.jsonl");
  process.env.AI_RUNS_LOG = logFile;
  __setTestHooks({ sleep: async (ms) => void sleeps.push(ms) });
});

describe("structuredCompletion", () => {
  it("devolve dados, usage e grava log", async () => {
    __setTestHooks({ client: fake(vi.fn(ok)) });
    const r = await run();
    expect(r.data).toEqual({ ok: true });
    expect(r.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    const line = JSON.parse(fs.readFileSync(logFile, "utf8").trim());
    expect(line).toMatchObject({ kind: "chat", prompt: "t@1.0", ok: true, input_tokens: 10 });
  });

  it("faz retry com backoff 1s/3s em 429 e depois conclui", async () => {
    const err = new OpenAI.RateLimitError(429, { message: "slow" }, "slow", new Headers());
    const parse = vi.fn().mockRejectedValueOnce(err).mockRejectedValueOnce(err).mockResolvedValue(ok());
    __setTestHooks({ client: fake(parse) });
    await run();
    expect(parse).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 3000]);
  });

  it("desiste após 3 retries com AiProviderError", async () => {
    const err = new OpenAI.InternalServerError(500, { message: "boom" }, "boom", new Headers());
    const parse = vi.fn().mockRejectedValue(err);
    __setTestHooks({ client: fake(parse) });
    await expect(run()).rejects.toBeInstanceOf(AiProviderError);
    expect(parse).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([1000, 3000, 8000]);
  });

  it("não faz retry em erro 400", async () => {
    const err = new OpenAI.BadRequestError(400, { message: "bad" }, "bad", new Headers());
    const parse = vi.fn().mockRejectedValue(err);
    __setTestHooks({ client: fake(parse) });
    const e = await run().catch((x) => x);
    expect(e).toBeInstanceOf(AiProviderError);
    expect(e.cause).toBe(err);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("lança AiOutputInvalidError quando output_parsed é null", async () => {
    __setTestHooks({ client: fake(() => ({ output_parsed: null, usage: null, output_text: "recusa" })) });
    await expect(run()).rejects.toBeInstanceOf(AiOutputInvalidError);
  });
});

describe("transcribe", () => {
  it("normaliza segmentos do whisper-1 para ms", async () => {
    const audio = path.join(path.dirname(logFile), "a.wav");
    fs.writeFileSync(audio, "x");
    const create = vi.fn(async () => ({
      text: "oi tudo bem",
      language: "portuguese",
      duration: 2.5,
      segments: [
        { id: 0, start: 0, end: 1.2, text: " oi " },
        { id: 1, start: 1.2, end: 2.5, text: "tudo bem" },
      ],
    }));
    __setTestHooks({ client: fake(vi.fn(), create) });
    const r = await transcribe({ filePath: audio, model: "whisper-1" });
    expect(r.duration_ms).toBe(2500);
    expect(r.segments).toEqual([
      { id: 0, start_ms: 0, end_ms: 1200, text: "oi" },
      { id: 1, start_ms: 1200, end_ms: 2500, text: "tudo bem" },
    ]);
  });
});
