import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPrompt, promptId } from "../src/services/aiAnalysis/prompts/loader.js";

function dirWith(file: string, text: string) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-"));
  fs.writeFileSync(path.join(d, file), text);
  return d;
}

describe("loadPrompt", () => {
  it("lê front-matter e corpo; normaliza version 1.0", () => {
    const dir = dirWith("extract.md", "---\nname: extract\nversion: 1.0\ntemperature: 0.1\n---\n\nVocê extrai.\n");
    const p = loadPrompt("extract", dir);
    expect(p).toEqual({ name: "extract", version: "1.0", system: "Você extrai.", temperature: 0.1 });
    expect(promptId(p)).toBe("extract@1.0");
  });

  it("falha se o name não bate ou falta temperature", () => {
    expect(() => loadPrompt("x", dirWith("x.md", "---\nname: y\nversion: 1.0\ntemperature: 0\n---\nA"))).toThrow(/name/);
    expect(() => loadPrompt("x", dirWith("x.md", "---\nname: x\nversion: 1.0\n---\nA"))).toThrow(/temperature/);
  });
});
