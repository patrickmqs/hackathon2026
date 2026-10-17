// Garante que o gabarito (sample_data/sample_analysis_expected.json) é consistente com a
// transcrição de exemplo: toda âncora existe literalmente e os itens plantados estão presentes.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.resolve(import.meta.dirname, "../../sample_data");
const transcript = fs.readFileSync(path.join(dir, "sample_transcript_pt.txt"), "utf8");
const gold = JSON.parse(fs.readFileSync(path.join(dir, "sample_analysis_expected.json"), "utf8"));
const e = gold.expected;

describe("sample_data: transcrição + gabarito", () => {
  it("tem os itens plantados do AI_PIPELINE §11", () => {
    const confirmed = e.decisions.filter((d: { status: string }) => d.status === "confirmed");
    const pending = e.decisions.filter((d: { status: string }) => d.status === "pending_validation");
    expect(confirmed).toHaveLength(2);
    expect(pending).toHaveLength(2);
    expect(e.commitments).toHaveLength(3);
    expect(e.commitments.filter((c: { owner_side: string }) => c.owner_side === "client")).not.toHaveLength(0);
    expect(e.commitments.filter((c: { owner_side: string }) => c.owner_side === "vendor")).not.toHaveLength(0);
    expect(e.commitments.filter((c: { status: string }) => c.status === "conditional")).toHaveLength(1);
    expect(e.contradictions).toHaveLength(1);
    expect(e.vague_terms).toHaveLength(3);
    expect(e.vendor_suggestions_not_accepted).toHaveLength(1);
  });

  it("toda citação-âncora existe literalmente na transcrição", () => {
    const anchors: string[] = [
      ...e.decisions.map((x: { anchor: string }) => x.anchor),
      ...e.commitments.map((x: { anchor: string }) => x.anchor),
      ...e.requirements.map((x: { anchor: string }) => x.anchor),
      ...e.contradictions.flatMap((x: { anchors: string[] }) => x.anchors),
      ...e.vague_terms.map((x: { anchor: string }) => x.anchor),
      ...e.vendor_suggestions_not_accepted.map((x: { anchor: string }) => x.anchor),
    ];
    const missing = anchors.filter((a) => !transcript.includes(a));
    expect(missing).toEqual([]);
  });

  it("o gabarito do resumo só referencia chaves que existem no gabarito", () => {
    const s = e.summary;
    const keys = (xs: { key: string }[]) => new Set(xs.map((x) => x.key));
    const decisions = keys(e.decisions);
    const issues = keys(e.contradictions);
    const suggestions = keys(e.vendor_suggestions_not_accepted);
    for (const k of s.key_decisions_must_include) expect(decisions.has(k), k).toBe(true);
    for (const k of s.pending_decisions_must_include) expect(decisions.has(k), k).toBe(true);
    for (const k of s.open_points_must_include) expect(issues.has(k), k).toBe(true);
    for (const k of s.must_not_appear_as_decision_or_next_step) expect(suggestions.has(k), k).toBe(true);
    // decisões confirmadas × pendentes do gabarito batem com as listas do resumo
    for (const d of e.decisions as { key: string; status: string }[]) {
      const list = d.status === "confirmed" ? s.key_decisions_must_include : s.pending_decisions_must_include;
      expect(list, d.key).toContain(d.key);
    }
  });

  it("não menciona o que deve virar pendência (volume, orçamento, prazo, nome do ERP)", () => {
    const t = transcript.toLowerCase();
    for (const word of ["orçamento", "quantos pedidos", "por mês", "totvs", "sap", "protheus"]) {
      expect(new RegExp(`\\b${word}\\b`).test(t), word).toBe(false);
    }
  });
});
