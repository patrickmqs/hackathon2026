import { describe, expect, it } from "vitest";
import { z } from "zod";
import example from "../../docs/examples/analysis.example.json";
import { ExtractionOutput, GapAuditOutput, MeetingAnalysis } from "../src/schemas/analysis";

describe("analysis schema", () => {
  it("valida o exemplo oficial", () => {
    const r = MeetingAnalysis.safeParse(example);
    expect(r.success, r.success ? "" : z.prettifyError(r.error)).toBe(true);
  });

  it("rejeita campo obrigatório ausente (strict para o LLM)", () => {
    const { summary: _omit, ...rest } = example;
    expect(MeetingAnalysis.safeParse(rest).success).toBe(false);
  });

  it("gera JSON Schema estrito para Structured Outputs", () => {
    for (const s of [ExtractionOutput, GapAuditOutput]) {
      const js = z.toJSONSchema(s) as { type: string; required: string[]; properties: object };
      expect(js.type).toBe("object");
      // todo campo obrigatório: nada de optional/default nos schemas enviados ao LLM
      expect(js.required.sort()).toEqual(Object.keys(js.properties).sort());
    }
  });
});
