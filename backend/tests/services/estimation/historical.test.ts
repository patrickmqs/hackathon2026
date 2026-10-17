import { describe, expect, it } from "vitest";
import { historyStats } from "../../../src/services/estimation/historical.js";

describe("historyStats", () => {
  it("retorna zero para histórico vazio", () => {
    expect(historyStats([])).toEqual({ count: 0, meanRatio: 0, maxRatio: 0 });
  });

  it("calcula razão média e máxima", () => {
    const stats = historyStats([
      { id: "a", estimatedHours: 100, actualHours: 110, complexity: "M" },
      { id: "b", estimatedHours: 200, actualHours: 260, complexity: "L" },
    ]);
    expect(stats.count).toBe(2);
    expect(stats.meanRatio).toBe(1.2);
    expect(stats.maxRatio).toBe(1.3);
  });
});
