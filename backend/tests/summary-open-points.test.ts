import { describe, expect, it } from "vitest";
import { openIssuePriority, SUMMARY_LIMITS, validateSummary } from "../src/services/aiAnalysis/summaryValidator.js";

type Issue = { id: string; type: string; impact: string[]; confidence: string; review_status: string };
const issue = (id: string, type: string, impact: string[], confidence = "medium"): Issue => ({
  id, type, impact, confidence, review_status: "pending",
});

const issues: Issue[] = [
  issue("iss_01", "missing_info", ["scope"]),
  issue("iss_02", "missing_info", ["cost"]),
  issue("iss_03", "vague_requirement", ["effort", "architecture"]),
  issue("iss_04", "missing_info", ["timeline"]),
  issue("iss_05", "contradiction", ["scope"]),
  issue("iss_06", "missing_info", ["architecture", "cost"]),
  issue("iss_07", "missing_info", ["scope"]),
];

const analysis = { summary: "", decisions: [], commitments: [], requirements: [], client_needs: [], tech_suggestions: [], open_issues: issues } as never;
const transcript = { text: "x", segments: [], metadata: {} } as never;
const base = {
  headline: "h", executive_summary: "e", topics: [], key_decisions: [], pending_decisions: [], next_steps: [],
  open_points: issues.map((i) => i.id),
};

describe("pontos em aberto do resumo", () => {
  it("prioriza contradição > impacto alto > custo/escopo", () => {
    const p = (i: Issue) => openIssuePriority(i);
    expect(p(issues[4]!)).toBeGreaterThan(p(issues[2]!)); // contradição vence
    expect(p(issues[2]!)).toBeGreaterThan(p(issues[3]!)); // 2 impactos altos > 1
    expect(p(issues[3]!)).toBeGreaterThan(p(issues[0]!)); // prazo > escopo
  });

  it(`corta para ${SUMMARY_LIMITS.max_open_points}, mantém os mais prioritários e a ordem do modelo, e registra`, () => {
    const r = validateSummary(base, { transcript, analysis, basis: "analysis" });
    expect(r.summary.open_points).toHaveLength(SUMMARY_LIMITS.max_open_points);
    expect(r.summary.open_points).toContain("iss_05"); // contradição sempre fica
    expect(r.summary.open_points).toContain("iss_03");
    // iss_01, iss_02 e iss_07 empatam (custo/escopo): vale a ordem original do modelo, então saem as duas últimas
    expect(r.summary.open_points).toContain("iss_01");
    expect(r.summary.open_points).not.toContain("iss_02");
    expect(r.summary.open_points).not.toContain("iss_07");
    expect(r.summary.open_points).toEqual([...r.summary.open_points].sort()); // ordem original preservada
    expect(r.limitations.join(" ")).toMatch(/2 pendência\(s\) de menor prioridade/);
  });

  it("não corta nem registra quando já está dentro do limite", () => {
    const r = validateSummary({ ...base, open_points: ["iss_05", "iss_03"] }, { transcript, analysis, basis: "analysis" });
    expect(r.summary.open_points).toEqual(["iss_05", "iss_03"]);
    expect(r.limitations.join(" ")).not.toMatch(/menor prioridade/);
  });
});
