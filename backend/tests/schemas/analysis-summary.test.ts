import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MeetingAnalysisSchema } from "../../src/schemas/analysis.js";

const example = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../../docs/examples/analysis.example.json"), "utf8"));

describe("MeetingAnalysisSchema e o resumo da reunião", () => {
  it("preserva meeting_summary ao validar (PUT /analysis não pode descartá-lo)", () => {
    const parsed = MeetingAnalysisSchema.parse(example);
    expect(parsed.meeting_summary).toEqual(example.meeting_summary);
  });

  it("aceita análises antigas sem o campo e assume null", () => {
    const { meeting_summary: _drop, ...legacy } = example;
    expect(MeetingAnalysisSchema.parse(legacy).meeting_summary).toBeNull();
  });
});
