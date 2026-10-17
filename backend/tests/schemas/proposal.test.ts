import { describe, it, expect } from "vitest";
import { ProposalContentSchema } from "../../src/schemas/proposal.js";
import proposalExample from "../../../docs/examples/proposal_content.example.json";

describe("schemas/proposal (B2)", () => {
  it("valida docs/examples/proposal_content.example.json", () => {
    const parsed = ProposalContentSchema.safeParse(proposalExample);
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? null)).toBe(true);
  });

  it("rejeita proposta sem título", () => {
    const { title: _title, ...rest } = proposalExample as Record<string, unknown>;
    expect(ProposalContentSchema.safeParse(rest).success).toBe(false);
  });

  it("rejeita complexidade de módulo inválida", () => {
    const bad = structuredClone(proposalExample) as Record<string, any>;
    bad.modules[0].complexity = "XXL";
    expect(ProposalContentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejeita status comercial inválido", () => {
    const bad = structuredClone(proposalExample) as Record<string, any>;
    bad.commercial.status = "negotiating";
    expect(ProposalContentSchema.safeParse(bad).success).toBe(false);
  });
});
