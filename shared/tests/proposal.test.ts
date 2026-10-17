import { describe, expect, it } from "vitest";
import { z } from "zod";
import example from "../../docs/examples/proposal_content.example.json";
import { Commercial, ProposalContent, ProposalTextOutput } from "../src/schemas/proposal";

describe("proposal schema", () => {
  it("valida o exemplo oficial", () => {
    const r = ProposalContent.safeParse(example);
    expect(r.success, r.success ? "" : z.prettifyError(r.error)).toBe(true);
  });

  it("exige disclaimer em demo_rates", () => {
    expect(Commercial.safeParse({ ...example.commercial, disclaimer: null }).success).toBe(false);
  });

  it("os campos textuais do exemplo validam em ProposalTextOutput", () => {
    const { is_ai_suggestion: _x, ...arch } = example.architecture;
    const text = {
      title: example.title,
      executive_summary: example.executive_summary,
      business_context: example.business_context,
      objectives: example.objectives,
      scope: example.scope,
      modules: example.modules.map((m) => ({ id: m.id, description: m.description, features: m.features })),
      requirements_and_integrations: example.requirements_and_integrations,
      architecture: arch,
      assumptions: example.assumptions,
      dependencies: example.dependencies,
      exclusions: example.exclusions,
      risks: example.risks,
      open_points: example.open_points,
      next_steps: example.next_steps,
    };
    const r = ProposalTextOutput.safeParse(text);
    expect(r.success, r.success ? "" : z.prettifyError(r.error)).toBe(true);
  });

  it("ProposalTextOutput gera JSON Schema estrito (sem record/optional/default)", () => {
    const js = z.toJSONSchema(ProposalTextOutput) as { type: string; required: string[]; properties: object };
    expect(js.type).toBe("object");
    expect(js.required.sort()).toEqual(Object.keys(js.properties).sort());
    const s = JSON.stringify(js);
    expect(s).not.toContain("propertyNames");
    expect(s).not.toContain('"default"');
    expect(s).not.toMatch(/"additionalProperties":\{/);
  });
});
