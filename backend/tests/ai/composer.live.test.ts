// Teste ao vivo do composer (AI_TESTS=1): chama a OpenAI de verdade (compose faz no máx. 2 chamadas).
import { describe, expect, it } from "vitest";
import analysisExample from "../../../docs/examples/analysis.example.json";
import proposalExample from "../../../docs/examples/proposal_content.example.json";
import {
  ProposalTextOutput,
  assertModulesMatch,
  assertNumbersUnchanged,
  compose,
  filterReviewed,
  type ComposerAnalysis,
  type ComposerEstimates,
} from "../../src/services/proposal/composer.js";

describe.skipIf(!process.env.AI_TESTS)("composer (OpenAI real)", () => {
  it("redige a proposta sem alterar números nem inventar módulos", { timeout: 180_000 }, async () => {
    // Simula a revisão humana: req_03 (ERP) e as sugestões da IA foram aceitos.
    const a = analysisExample as unknown as ComposerAnalysis;
    const reviewed: ComposerAnalysis = {
      ...a,
      requirements: a.requirements.map((r) => (r.id === "req_03" ? { ...r, review_status: "edited" } : r)),
      tech_suggestions: a.tech_suggestions.map((s) => ({ ...s, review_status: "confirmed" })),
    };
    const filtered = filterReviewed(reviewed);
    const estimates: ComposerEstimates = {
      estimates: proposalExample.estimates as ComposerEstimates["estimates"],
      team: proposalExample.team,
      schedule: proposalExample.schedule,
      total_weeks: proposalExample.total_weeks,
      commercial: proposalExample.commercial,
    };

    const out = await compose(filtered, estimates, proposalExample.vendor);

    expect(ProposalTextOutput.safeParse(out).success).toBe(true);
    expect(() => assertModulesMatch(out, filtered)).not.toThrow();
    expect(() => assertNumbersUnchanged(out, estimates)).not.toThrow();
    expect(out.modules.map((m) => m.id).sort()).toEqual(["mod_01", "mod_02", "mod_03"]);
    // Pendência (aprovação de crédito) e mobile não podem virar escopo contratado.
    expect(out.scope.in_scope.join(" ")).not.toMatch(/aplicativo mobile|aprovação de crédito/i);
    // A arquitetura vem de sugestões: precisa estar redigida como sugestão.
    expect(out.architecture.overview).toMatch(/suger|sugest|propõe|propõ|a confirmar|a definir|será definida/i);
    console.log(JSON.stringify(out, null, 2));
  });
});
