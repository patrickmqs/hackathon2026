import { describe, it, expect } from "vitest";
import { estimate } from "../../../src/services/estimation/engine.js";
import { HOURS_BY_COMPLEXITY } from "../../../src/services/estimation/rules.js";

describe("estimation/engine — determinístico (B7)", () => {
  it("é determinístico para a mesma entrada", () => {
    const input = {
      modules: [
        { id: "m1", complexity: "M" as const },
        { id: "m2", complexity: "L" as const },
      ],
      integrationCount: 1,
      nfrCount: 3,
      unresolvedEffortIssues: 2,
    };
    expect(estimate(input)).toEqual(estimate(input));
  });

  it("complexidade S/M/L/XL produz faixas crescentes", () => {
    const [s] = HOURS_BY_COMPLEXITY.S;
    const [m] = HOURS_BY_COMPLEXITY.M;
    const [l] = HOURS_BY_COMPLEXITY.L;
    const [xl] = HOURS_BY_COMPLEXITY.XL;
    expect(s).toBeLessThan(m);
    expect(m).toBeLessThan(l);
    expect(l).toBeLessThan(xl);
  });

  it("um módulo M gera total maior que a faixa base (cross-cutting incluso)", () => {
    const r = estimate({ modules: [{ id: "m1", complexity: "M" }] });
    expect(r.total_hours_min).toBeGreaterThan(60);
    expect(r.total_hours_max).toBeGreaterThan(120);
  });

  it("aplica sobretaxa de integração", () => {
    const base = estimate({ modules: [] });
    const withInt = estimate({ modules: [], integrationCount: 1 });
    expect(withInt.total_hours_min).toBeGreaterThan(base.total_hours_min);
    expect(withInt.total_hours_max).toBeGreaterThan(base.total_hours_max);
  });

  it("aplica sobretaxa NFR apenas com >= 3 requisitos", () => {
    const base = estimate({ modules: [{ id: "m1", complexity: "M" }] });
    const below = estimate({ modules: [{ id: "m1", complexity: "M" }], nfrCount: 2 });
    const above = estimate({ modules: [{ id: "m1", complexity: "M" }], nfrCount: 3 });
    expect(below.total_hours_max).toBe(base.total_hours_max);
    expect(above.total_hours_max).toBeGreaterThan(base.total_hours_max);
  });

  it("incerteza amplia apenas o teto (hours_max)", () => {
    const zero = estimate({ modules: [{ id: "m1", complexity: "M" }] });
    const two = estimate({ modules: [{ id: "m1", complexity: "M" }], unresolvedEffortIssues: 2 });
    expect(two.total_hours_max).toBeGreaterThan(zero.total_hours_max);
    expect(two.total_hours_min).toBe(zero.total_hours_min);
  });

  it("tamanho da equipe segue a regra (<400 → 2, >=900 → 4)", () => {
    expect(estimate({ modules: [{ id: "s", complexity: "S" }] }).suggested_team_size).toBe(2);
    expect(
      estimate({
        modules: [
          { id: "xl1", complexity: "XL" },
          { id: "xl2", complexity: "XL" },
        ],
      }).suggested_team_size,
    ).toBe(4);
  });

  it("confiança depende de pendências e complexidade conhecida", () => {
    expect(estimate({ modules: [{ id: "m", complexity: "M" }] }).confidence).toBe("high");
    expect(estimate({ modules: [{ id: "m", complexity: "unknown" }] }).confidence).toBe("medium");
    expect(
      estimate({ modules: [{ id: "m", complexity: "M" }], unresolvedEffortIssues: 3 }).confidence,
    ).toBe("low");
  });

  it("registra assumption para módulo de complexidade desconhecida", () => {
    const r = estimate({ modules: [{ id: "m1", complexity: "unknown" }] });
    expect(r.assumptions).toContain("Módulo m1 sem complexidade — tratado como M");
  });

  it("linhas são geradas por módulo × perfil", () => {
    const r = estimate({ modules: [{ id: "m1", complexity: "M" }] });
    expect(r.lines.length).toBe(5); // 5 perfis
    expect(r.lines.every((l) => l.module_id === "m1")).toBe(true);
  });
});
