import { describe, expect, it } from "vitest";
import { z } from "zod";
import example from "../../docs/examples/analysis.example.json";
import summaryExample from "../../docs/examples/summary.example.json";
import {
  ExtractionOutput,
  GapAuditOutput,
  MeetingAnalysis,
  MeetingSummary,
  MeetingSummaryOutput,
} from "../src/schemas/analysis";

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
    for (const s of [ExtractionOutput, GapAuditOutput, MeetingSummaryOutput]) {
      const js = z.toJSONSchema(s) as { type: string; required: string[]; properties: object };
      expect(js.type).toBe("object");
      // todo campo obrigatório: nada de optional/default nos schemas enviados ao LLM
      expect(js.required.sort()).toEqual(Object.keys(js.properties).sort());
    }
  });
});

describe("meeting summary", () => {
  it("valida o exemplo de resumo e o embutido na análise", () => {
    const r = MeetingSummary.safeParse(summaryExample);
    expect(r.success, r.success ? "" : z.prettifyError(r.error)).toBe(true);
    expect(example.meeting_summary).toEqual(summaryExample);
  });

  it("respeita os limites e referencia só ids existentes no tipo certo", () => {
    const s = summaryExample;
    expect(s.headline.length).toBeLessThanOrEqual(140);
    expect(s.executive_summary.length).toBeLessThanOrEqual(700);
    expect(s.topics.length).toBeGreaterThanOrEqual(3);
    expect(s.topics.length).toBeLessThanOrEqual(8);
    const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const dec = byId(example.decisions);
    const com = byId(example.commitments);
    const iss = byId(example.open_issues);
    for (const id of s.key_decisions) expect(dec.get(id)?.status, id).toBe("confirmed");
    for (const id of s.pending_decisions) expect(dec.get(id)?.status, id).toBe("pending_validation");
    for (const id of s.next_steps) expect(com.has(id), id).toBe(true);
    for (const id of s.open_points) expect(iss.has(id), id).toBe(true);
  });

  it("não deixa nenhuma decisão fora das listas (nada omitido)", () => {
    const listed = new Set([...summaryExample.key_decisions, ...summaryExample.pending_decisions]);
    for (const d of example.decisions) expect(listed.has(d.id), d.id).toBe(true);
  });
});
