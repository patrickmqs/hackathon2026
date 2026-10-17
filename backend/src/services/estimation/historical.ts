// Dados históricos para calibração de estimativas — B7 (AI_PIPELINE §9).
// O motor (`engine.ts`) é determinístico e NÃO consome histórico ainda; este módulo
// define o formato e um resumo estatístico para futura calibração do teto de horas.

export interface HistoricalProject {
  id: string;
  estimatedHours: number;
  actualHours: number;
  complexity: "S" | "M" | "L" | "XL";
}

export interface HistoryStats {
  count: number;
  meanRatio: number; // média de actual/estimated (≥ 0)
  maxRatio: number;
}

export function historyStats(history: HistoricalProject[]): HistoryStats {
  if (history.length === 0) return { count: 0, meanRatio: 0, maxRatio: 0 };
  const ratios = history.map((h) => h.actualHours / Math.max(1, h.estimatedHours));
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return {
    count: history.length,
    meanRatio: round2(mean),
    maxRatio: round2(Math.max(...ratios)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
