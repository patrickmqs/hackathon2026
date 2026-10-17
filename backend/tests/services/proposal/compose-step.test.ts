import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MeetingAnalysisSchema } from "../../../src/schemas/analysis.js";
import { ProposalContentSchema } from "../../../src/schemas/proposal.js";
import { buildProposalContent } from "../../../src/services/proposal/builder.js";
import { applyComposedText, toComposerEstimates } from "../../../src/services/proposal/compose-step.js";
import type { ProposalTextOutput } from "../../../src/services/proposal/composer.js";

const root = path.resolve(import.meta.dirname, "../../../..");
const analysis = MeetingAnalysisSchema.parse(JSON.parse(fs.readFileSync(path.join(root, "docs/examples/analysis.example.json"), "utf8")));
const project = { id: "p1", name: "Portal B2B", client: { company: "Distribuidora Horizonte" } } as never;
const meeting = { id: "m1" } as never;
const built = () => buildProposalContent({ project, meeting, analysis });

function fakeText(content: ReturnType<typeof built>): ProposalTextOutput {
  return {
    title: "Proposta redigida pela IA",
    executive_summary: "Resumo executivo redigido.",
    business_context: "Contexto redigido.",
    objectives: ["Faturar no mesmo dia"],
    scope: { in_scope: ["Catálogo"], out_of_scope: ["App nativo"] },
    modules: content.modules.map((m) => ({ id: m.id, description: `Descrição IA de ${m.name}`, features: ["F1"] })),
    requirements_and_integrations: [{ title: "ERP", description: "Integração", type: "integration" }],
    architecture: { overview: "Arquitetura redigida", components: [], technologies: [], diagram_mermaid: null },
    assumptions: ["Premissa redigida"],
    dependencies: [],
    exclusions: ["App nativo"],
    risks: [],
    open_points: [{ description: "ERP desconhecido", question: "Qual ERP?" }],
    next_steps: ["Enviar proposta"],
  };
}

describe("applyComposedText", () => {
  it("troca só o texto e preserva todos os números e dados do builder", async () => {
    const base = built();
    const composer = vi.fn(async () => fakeText(base));
    const r = await applyComposedText(base, analysis, composer);

    expect(r.composed).toBe(true);
    expect(r.warning).toBeNull();
    // o resultado continua sendo uma proposta válida (edição, hash e PDF dependem disso)
    expect(ProposalContentSchema.safeParse(r.content).success).toBe(true);
    expect(r.content.executive_summary).toBe("Resumo executivo redigido.");
    expect(r.content.modules[0]!.description).toContain("Descrição IA");
    expect(r.content.architecture.is_ai_suggestion).toBe(true);
    // nada numérico ou factual do builder mudou
    for (const k of ["estimates", "team", "schedule", "total_weeks", "commercial", "meta", "client", "vendor"] as const) {
      expect(r.content[k], k).toEqual(base[k]);
    }
    expect(r.content.modules.map((m) => [m.id, m.complexity, m.source_requirement_ids])).toEqual(
      base.modules.map((m) => [m.id, m.complexity, m.source_requirement_ids]),
    );
  });

  it("entrega ao composer as estimativas aninhadas do builder", async () => {
    const base = built();
    const composer = vi.fn(async () => fakeText(base));
    await applyComposedText(base, analysis, composer);
    const est = composer.mock.calls[0]![1];
    expect(est.estimates.total_hours_min).toBe(base.estimates.total_hours_min);
    expect(est.estimates.lines.length).toBe(base.estimates.lines.length);
    expect(est).toEqual(toComposerEstimates(base));
  });

  it("se a IA falha, mantém o conteúdo determinístico e devolve aviso", async () => {
    const base = built();
    const r = await applyComposedText(base, analysis, async () => {
      throw new Error("OpenAI indisponível");
    });
    expect(r.composed).toBe(false);
    expect(r.content).toBe(base);
    expect(r.warning).toContain("OpenAI indisponível");
  });
});
