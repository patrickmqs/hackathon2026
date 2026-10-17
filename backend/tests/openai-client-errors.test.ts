import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiOutputInvalidError, AiProviderError } from "../src/core/errors.js";
import { __setTestHooks, structuredCompletion } from "../src/integrations/openai/client.js";

const prompt = { name: "t", version: "1.0", system: "sys", temperature: 0.1 };
const schema = z.object({ kind: z.enum(["a", "b"]) });
const fake = (parse: () => unknown) => ({ responses: { parse } }) as unknown as OpenAI;
const run = () => structuredCompletion({ prompt, input: "x", schema, schemaName: "probe" });

beforeEach(() => {
  process.env.AI_RUNS_LOG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "airuns-")), "ai_runs.jsonl");
  __setTestHooks({ sleep: async () => {} });
});

describe("structuredCompletion: erros do parse", () => {
  it("ZodError (enum inválido) vira AiOutputInvalidError com erros formatados em details", async () => {
    const parse = vi.fn(() => schema.parse({ kind: "zzz" }));
    __setTestHooks({ client: fake(parse) });
    const e = await run().catch((x) => x);
    expect(e).toBeInstanceOf(AiOutputInvalidError);
    expect(typeof e.details).toBe("string");
    expect(e.details).toContain("kind");
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("SyntaxError (JSON truncado) vira AiOutputInvalidError", async () => {
    __setTestHooks({ client: fake(() => JSON.parse('{"kind": "a')) });
    const e = await run().catch((x) => x);
    expect(e).toBeInstanceOf(AiOutputInvalidError);
    expect(String(e.details)).toMatch(/JSON|Unexpected|end/i);
  });

  it.each([400, 401, 413])("status %i não retentável sai como AiProviderError com status em cause", async (status) => {
    const err = new OpenAI.APIError(status, { message: "nope" }, "nope", new Headers());
    const parse = vi.fn().mockRejectedValue(err);
    __setTestHooks({ client: fake(parse) });
    const e = await run().catch((x) => x);
    expect(e).toBeInstanceOf(AiProviderError);
    expect((e as AiProviderError).cause).toMatchObject({ status });
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
