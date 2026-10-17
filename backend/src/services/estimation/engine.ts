import {
  HOURS_BY_COMPLEXITY,
  PROFILE_SPLIT,
  INTEGRATION_SURCHARGE,
  NFR_SURCHARGE_PCT,
  NFR_SURCHARGE_MIN_REQUIREMENTS,
  UNCERTAINTY_PCT,
  CROSS_CUTTING,
  WEEKLY_CAPACITY_PER_DEV,
  type Complexity,
  type KnownComplexity,
} from "./rules.js";

export interface ModuleInput {
  id: string;
  complexity: Complexity;
}

export interface EstimateInput {
  modules: ModuleInput[];
  integrationCount?: number;
  nfrCount?: number;
  unresolvedEffortIssues?: number;
}

export interface EstimateLine {
  module_id: string;
  profile: string;
  hours_min: number;
  hours_max: number;
}

export interface EstimateResult {
  total_hours_min: number;
  total_hours_max: number;
  lines: EstimateLine[];
  totals_by_profile: Record<string, { hours_min: number; hours_max: number }>;
  confidence: "high" | "medium" | "low";
  suggested_team_size: number;
  total_weeks: number;
  assumptions: string[];
}

const PROFILES = Object.keys(PROFILE_SPLIT);

function resolveComplexity(c: Complexity): KnownComplexity {
  return c === "unknown" ? "M" : c;
}

// Algoritmo determinístico — AI_PIPELINE §9. Sem I/O externo (histórico é injetado fora).
export function estimate(input: EstimateInput): EstimateResult {
  const assumptions: string[] = [];
  const modules = input.modules ?? [];
  const integrationCount = input.integrationCount ?? 0;
  const nfrCount = input.nfrCount ?? 0;
  const unresolved = input.unresolvedEffortIssues ?? 0;

  // 1. Faixa por módulo.
  let moduleMin = 0;
  let moduleMax = 0;
  for (const m of modules) {
    const c = resolveComplexity(m.complexity);
    const [min, max] = HOURS_BY_COMPLEXITY[c];
    if (m.complexity === "unknown") {
      assumptions.push(`Módulo ${m.id} sem complexidade — tratado como M`);
    }
    moduleMin += min;
    moduleMax += max;
  }

  // 2. Sobretaxas de integração e de requisitos não funcionais.
  let totalMin = moduleMin + INTEGRATION_SURCHARGE[0] * integrationCount;
  let totalMax = moduleMax + INTEGRATION_SURCHARGE[1] * integrationCount;

  if (nfrCount >= NFR_SURCHARGE_MIN_REQUIREMENTS) {
    totalMin += Math.round(totalMin * NFR_SURCHARGE_PCT);
    totalMax += Math.round(totalMax * NFR_SURCHARGE_PCT);
  }

  // 3. Incerteza amplia apenas o teto (hours_max).
  const bucket = Math.min(Math.max(unresolved, 0), 3);
  const uncertainty = UNCERTAINTY_PCT[bucket] ?? UNCERTAINTY_PCT[3];
  totalMax += Math.round(totalMax * uncertainty);

  // 4. Linhas por módulo × perfil.
  const lines: EstimateLine[] = [];
  for (const m of modules) {
    const c = resolveComplexity(m.complexity);
    const [min, max] = HOURS_BY_COMPLEXITY[c];
    for (const profile of PROFILES) {
      lines.push({
        module_id: m.id,
        profile,
        hours_min: Math.round(min * PROFILE_SPLIT[profile]),
        hours_max: Math.round(max * PROFILE_SPLIT[profile]),
      });
    }
  }

  // 5. Totais por perfil + cross-cutting.
  const crossMin = Object.values(CROSS_CUTTING).reduce((sum, [a]) => sum + a, 0);
  const crossMax = Object.values(CROSS_CUTTING).reduce((sum, [, b]) => sum + b, 0);

  const totals_by_profile: Record<string, { hours_min: number; hours_max: number }> = {};
  let grandMin = 0;
  let grandMax = 0;
  for (const profile of PROFILES) {
    const share = PROFILE_SPLIT[profile];
    const min = Math.round(totalMin * share) + Math.round(crossMin * share);
    const max = Math.round(totalMax * share) + Math.round(crossMax * share);
    totals_by_profile[profile] = { hours_min: min, hours_max: max };
    grandMin += min;
    grandMax += max;
  }

  // 6. Confiança.
  const allKnown = modules.every((m) => m.complexity !== "unknown");
  const confidence = unresolved === 0 && allKnown ? "high" : unresolved <= 2 ? "medium" : "low";

  // 7. Equipe sugerida e cronograma.
  const team = grandMax < 400 ? 2 : grandMax < 900 ? 3 : 4;
  const total_weeks = Math.max(1, Math.ceil(grandMax / (team * WEEKLY_CAPACITY_PER_DEV)));

  return {
    total_hours_min: grandMin,
    total_hours_max: grandMax,
    lines,
    totals_by_profile,
    confidence,
    suggested_team_size: team,
    total_weeks,
    assumptions,
  };
}
