import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import analysisExample from "../../docs/examples/analysis.example.json";
import proposalExample from "../../docs/examples/proposal_content.example.json";
import { ProposalTextOutput as SharedTextOutput } from "../../shared/src/schemas/proposal";
import { __setTestHooks } from "../src/integrations/openai/client.js";
import { loadPrompt } from "../src/services/aiAnalysis/prompts/loader.js";
import * as rules from "../src/services/estimation/rules.js";
import {
  ProposalTextOutput,
  assertModulesMatch,
  assertNumbersUnchanged,
  compose,
  filterReviewed,
  findNumberViolations,
  type ComposerAnalysis,
  type ComposerEstimates,
} from "../src/services/proposal/composer.js";

type Text = z.infer<typeof ProposalTextOutput>;

const analysis = analysisExample as unknown as ComposerAnalysis;
const est = { estimates: proposalExample.estimates } as ComposerEstimates;

function textFromExample(): Text {
  const { is_ai_suggestion: _x, ...arch } = proposalExample.architecture;
  return {
    title: proposalExample.title,
    executive_summary: proposalExample.executive_summary,
    business_context: proposalExample.business_context,
    objectives: proposalExample.objectives,
    scope: proposalExample.scope,
    modules: proposalExample.modules.map((m) => ({ id: m.id, description: m.description, features: m.features })),
    requirements_and_integrations: proposalExample.requirements_and_integrations,
    architecture: arch,
    assumptions: proposalExample.assumptions,
    dependencies: proposalExample.dependencies,
    exclusions: proposalExample.exclusions,
    risks: proposalExample.risks,
    open_points: proposalExample.open_points,
    next_steps: proposalExample.next_steps,
  };
}

describe("schema local do composer", () => {
  it("tem o mesmo JSON Schema de shared ProposalTextOutput (anti-divergência)", () => {
    expect(z.toJSONSchema(ProposalTextOutput)).toEqual(z.toJSONSchema(SharedTextOutput));
  });
});

describe("prompt compose_proposal", () => {
  it("carrega com temperature 0.4", () => {
    const p = loadPrompt("compose_proposal");
    expect(p.temperature).toBe(0.4);
    expect(p.version).toBe("1.0");
  });
});

describe("filterReviewed", () => {
  it("mantém só confirmed/edited e remove módulos sem requisito revisado", () => {
    const f = filterReviewed(analysis);
    expect(f.requirements.map((r) => r.id)).toEqual(["req_01", "req_02"]);
    expect(f.modules.map((m) => m.id)).toEqual(["mod_01", "mod_02"]);
    expect(f.decisions.map((d) => d.id)).toEqual(["dec_01"]);
    expect(f.tech_suggestions).toEqual([]);
  });
});

describe("assertNumbersUnchanged", () => {
  it("aceita números que constam nas estimativas", () => {
    const t = textFromExample();
    t.executive_summary += " O esforço total é de 332 a 667 horas, em 9 semanas.";
    expect(() => assertNumbersUnchanged(t, { ...est, total_weeks: 9 })).not.toThrow();
  });

  it("ignora números sem unidade de esforço (2 s, 50 usuários)", () => {
    expect(findNumberViolations(textFromExample(), est)).toEqual([]);
  });

  it("rejeita horas, semanas e valores inventados", () => {
    const t = textFromExample();
    t.executive_summary = "Estimamos 500 horas, 12 semanas e R$ 99.000,00.";
    expect(findNumberViolations(t, est).sort()).toEqual(["12", "500", "R$ 99.000,00"].sort());
    expect(() => assertNumbersUnchanged(t, est)).toThrow(/fora das estimativas/);
  });

  it("detecta o limite de uma faixa alterado", () => {
    const t = textFromExample();
    t.business_context = "Faixa de 332 a 700 h.";
    expect(findNumberViolations(t, est)).toEqual(["700"]);
  });
});

describe("assertModulesMatch", () => {
  it("falha com módulo a mais ou a menos", () => {
    const f = filterReviewed(analysis);
    const t = textFromExample(); // tem mod_03; a análise filtrada não
    expect(() => assertModulesMatch(t, f)).toThrow();
    expect(() => assertModulesMatch({ ...t, modules: t.modules.slice(0, 2) }, f)).not.toThrow();
  });
});

describe("compose", () => {
  beforeEach(() => {
    process.env.AI_RUNS_LOG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "airuns-")), "ai_runs.jsonl");
    __setTestHooks({ sleep: async () => {} });
  });
  const fake = (parse: ReturnType<typeof vi.fn>) => ({ responses: { parse } }) as unknown as OpenAI;
  const res = (o: unknown) => ({ output_parsed: o, usage: { input_tokens: 1, output_tokens: 1 }, output_text: "" });

  it("refaz uma vez quando o texto altera números e devolve a versão corrigida", async () => {
    const promoted = {
      ...analysis,
      requirements: analysis.requirements.map((r) => ({ ...r, review_status: "confirmed" })),
    };
    const good = textFromExample();
    const bad = { ...good, executive_summary: "Serão 999 horas." };
    const parse = vi.fn().mockResolvedValueOnce(res(bad)).mockResolvedValueOnce(res(good));
    __setTestHooks({ client: fake(parse) });
    const out = await compose(promoted, est, { company: "Nimbus" });
    expect(out).toEqual(good);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1]![0].input).toContain("CORREÇÃO NECESSÁRIA");
    expect(parse.mock.calls[0]![0].temperature).toBe(0.4);
  });

  it("não envia itens pendentes ao LLM", async () => {
    const good = { ...textFromExample(), modules: textFromExample().modules.slice(0, 2) };
    const parse = vi.fn().mockResolvedValue(res(good));
    __setTestHooks({ client: fake(parse) });
    await compose(analysis, est, { company: "Nimbus" });
    const input = parse.mock.calls[0]![0].input as string;
    expect(input).not.toContain("req_03");
    expect(input).not.toContain("dec_02");
  });

  it("falha depois de 2 tentativas inválidas", async () => {
    const bad = { ...textFromExample(), executive_summary: "999 horas" };
    const parse = vi.fn().mockResolvedValue(res(bad));
    __setTestHooks({ client: fake(parse) });
    await expect(compose(analysis, est, { company: "x" })).rejects.toThrow();
    expect(parse).toHaveBeenCalledTimes(2);
  });
});

describe("estimation rules", () => {
  it("PROFILE_SPLIT soma 1 e faixas são coerentes", () => {
    expect(Object.values(rules.PROFILE_SPLIT).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1);
    for (const [lo, hi] of Object.values(rules.HOURS_BY_COMPLEXITY)) expect(lo).toBeLessThan(hi);
    expect(rules.UNCERTAINTY_PCT).toHaveLength(4);
  });
});
