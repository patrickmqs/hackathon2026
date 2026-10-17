// Regras do motor de estimativas — AI_PIPELINE §9 (dados, não lógica).

export type Complexity = "S" | "M" | "L" | "XL" | "unknown";
export type KnownComplexity = Exclude<Complexity, "unknown">;

// Faixa total mín–máx por módulo.
export const HOURS_BY_COMPLEXITY: Record<KnownComplexity, [number, number]> = {
  S: [24, 48],
  M: [60, 120],
  L: [140, 260],
  XL: [300, 520],
};

// Distribuição das horas do módulo por perfil (soma = 1).
export const PROFILE_SPLIT: Record<string, number> = {
  backend_dev: 0.4,
  frontend_dev: 0.3,
  qa: 0.15,
  ux: 0.05,
  pm: 0.1,
};

// Sobretaxa por requisito type=integration.
export const INTEGRATION_SURCHARGE: [number, number] = [16, 40];

// Sobretaxa de requisitos não funcionais.
export const NFR_SURCHARGE_PCT = 0.1;
export const NFR_SURCHARGE_MIN_REQUIREMENTS = 3;

// Amplia hours_max conforme nº de pendências de impacto effort/architecture (≥3 → 0.20).
export const UNCERTAINTY_PCT: Record<number, number> = {
  0: 0.0,
  1: 0.05,
  2: 0.1,
  3: 0.2,
};

// Horas fixas de projeto.
export const CROSS_CUTTING: Record<string, [number, number]> = {
  setup_devops: [24, 40],
  discovery_refinement: [16, 32],
  deploy_handover: [16, 24],
};

// Horas produtivas por semana por dev.
export const WEEKLY_CAPACITY_PER_DEV = 32;
