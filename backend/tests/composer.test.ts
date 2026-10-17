import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import analysisExample from "../../docs/examples/analysis.example.json";
import proposalExample from "../../docs/examples/proposal_content.example.json";
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

  it("falha depois das tentativas inválidas", async () => {
    const bad = { ...textFromExample(), executive_summary: "999 horas" };
    const parse = vi.fn().mockResolvedValue(res(bad));
    __setTestHooks({ client: fake(parse) });
    await expect(compose(analysis, est, { company: "x" })).rejects.toThrow();
    expect(parse).toHaveBeenCalledTimes(3);
  });
});

describe("findNumberViolations: precisão (revisão A)", () => {
  const v = (s: string, e: ComposerEstimates = { ...est, total_weeks: 9 }) => {
    const t = textFromExample();
    t.executive_summary = s;
    return findNumberViolations(t, e);
  };

  it("não derruba números que não são esforço", () => {
    expect(v("Suporte com disponibilidade 24h.")).toEqual([]);
    expect(v("Tempo de resposta em 48 horas.")).toEqual([]);
    expect(v("Teremos reuniões de 2 horas a cada sprint.")).toEqual([]);
  });

  it("rótulo de fase não é lido como semanas", () => {
    expect(v("Fase 1 - 4 semanas de construção.", { ...est, total_weeks: 4 })).toEqual([]);
    expect(v("Etapa 2 – 9 semanas.", { ...est, total_weeks: 9 })).toEqual([]);
  });

  it("valores monetários abreviados são conferidos", () => {
    const e = { ...est, commercial: { total_min: 50000, total_max: 90000, hourly_rates: {} } } as ComposerEstimates;
    expect(v("Investimento de R$ 50k.", e)).toEqual([]);
    expect(v("Investimento de R$ 70k.", e)).not.toEqual([]);
  });

  it("detecta variações de unidade que antes escapavam", () => {
    expect(v("Serão 40hrs de trabalho.")).not.toEqual([]);
    expect(v("O projeto leva 3 meses.")).not.toEqual([]);
    expect(v("Entrega em 20 dias.")).not.toEqual([]);
    expect(v("Valor de US$ 5.000.")).not.toEqual([]);
    expect(v("Custo de 50 mil reais.")).not.toEqual([]);
    expect(v("Esforço de 12.5h.")).not.toEqual([]);
  });

  it("faixa precisa ser um par conhecido (não só números soltos)", () => {
    expect(v("Esforço de 24 a 667 horas.")).not.toEqual([]);
    expect(v("Esforço de 332 a 667 horas.")).toEqual([]);
  });
});

describe("compose: tentativas e erros do modelo (revisão A)", () => {
  beforeEach(() => {
    process.env.AI_RUNS_LOG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "airuns-")), "ai_runs.jsonl");
    __setTestHooks({ sleep: async () => {} });
  });
  const fake = (parse: ReturnType<typeof vi.fn>) => ({ responses: { parse } }) as unknown as OpenAI;
  const res = (o: unknown) => ({ output_parsed: o, usage: { input_tokens: 1, output_tokens: 1 }, output_text: "" });
  const good = () => ({ ...textFromExample(), modules: textFromExample().modules.slice(0, 2) });

  it("faz 3 tentativas quando o texto segue inválido", async () => {
    const bad = { ...good(), executive_summary: "999 horas" };
    const parse = vi.fn().mockResolvedValue(res(bad));
    __setTestHooks({ client: fake(parse) });
    await expect(compose(analysis, est, { company: "x" })).rejects.toThrow();
    expect(parse).toHaveBeenCalledTimes(3);
  });

  it("recusa/saída nula na 1ª tentativa vira repair, não erro", async () => {
    const parse = vi.fn().mockResolvedValueOnce(res(null)).mockResolvedValueOnce(res(good()));
    __setTestHooks({ client: fake(parse) });
    const out = await compose(analysis, est, { company: "x" });
    expect(out).toEqual(good());
    expect(parse.mock.calls[1]![0].input).toContain("CORREÇÃO NECESSÁRIA");
  });

  it("erro de provedor continua propagando sem repair", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("boom"));
    __setTestHooks({ client: fake(parse) });
    await expect(compose(analysis, est, { company: "x" })).rejects.toThrow("boom");
    expect(parse).toHaveBeenCalledTimes(1);
  });
});

describe("compose: exclusões só de decisões confirmed (revisão D)", () => {
  it("prompt exige status=confirmed para exclusions e manda pendentes para open_points", () => {
    const p = loadPrompt("compose_proposal").system;
    const rule6 = p.split("\n").find((l) => l.startsWith("6."))!;
    expect(rule6).toMatch(/confirmed/);
    expect(rule6).toMatch(/pending_validation/);
    expect(rule6).toMatch(/open_points/);
  });
});

describe("estimation rules", () => {
  it("PROFILE_SPLIT soma 1 e faixas são coerentes", () => {
    expect(Object.values(rules.PROFILE_SPLIT).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1);
    for (const [lo, hi] of Object.values(rules.HOURS_BY_COMPLEXITY)) expect(lo).toBeLessThan(hi);
    expect(Object.keys(rules.UNCERTAINTY_PCT)).toHaveLength(4);
  });
});
