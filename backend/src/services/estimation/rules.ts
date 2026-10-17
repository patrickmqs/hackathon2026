// Regras de estimativa (docs/AI_PIPELINE.md §9): dados, não lógica — ajustáveis sem alterar o motor (T07).
// O motor determinístico (`engine.ts`) consome estas constantes; a IA nunca calcula horas.

export type Complexity = "S" | "M" | "L" | "XL";
export type EstimateProfile = "backend_dev" | "frontend_dev" | "qa" | "ux" | "pm" | "devops";
/** Faixa [mínimo, máximo]. */
export type Range = readonly [number, number];

/** Horas por módulo (faixa total mín–máx). Módulos `unknown` são tratados como `M` pelo motor. */
export const HOURS_BY_COMPLEXITY: Readonly<Record<Complexity, Range>> = {
  S: [24, 48],
  M: [60, 120],
  L: [140, 260],
  XL: [300, 520],
};

/** Distribuição das horas do módulo por perfil (soma = 1; o resto de arredondamento vai ao backend_dev). */
export const PROFILE_SPLIT: Readonly<Partial<Record<EstimateProfile, number>>> = {
  backend_dev: 0.4,
  frontend_dev: 0.3,
  qa: 0.15,
  ux: 0.05,
  pm: 0.1,
};

/** Sobretaxa por requisito `type=integration`. */
export const INTEGRATION_SURCHARGE: Range = [16, 40];

/** Acréscimo se houver ≥ 3 requisitos não funcionais. */
export const NFR_SURCHARGE_PCT = 0.1;

/** Mínimo de requisitos não funcionais para aplicar NFR_SURCHARGE_PCT. */
export const NFR_SURCHARGE_MIN_COUNT = 3;

/** Acréscimo em `hours_max`; índice = nº de pendências effort/architecture não resolvidas (≥ 3 → último valor). */
export const UNCERTAINTY_PCT: readonly number[] = [0.0, 0.05, 0.1, 0.2];

/** Horas fixas de projeto (perfil devops). */
export const CROSS_CUTTING: Readonly<Record<"setup_devops" | "discovery_refinement" | "deploy_handover", Range>> = {
  setup_devops: [24, 40],
  discovery_refinement: [16, 32],
  deploy_handover: [16, 24],
};

/** Horas produtivas por desenvolvedor por semana. */
export const WEEKLY_CAPACITY_PER_DEV = 32;
