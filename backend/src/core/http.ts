import { z } from "zod";
import { DomainError } from "./errors.js";

// Parse e valida o corpo da requisição, convertendo falha de Zod em DomainError
// 400 VALIDATION_ERROR com as issues no envelope (API_SPEC §2).
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new DomainError("VALIDATION_ERROR", "Corpo da requisição inválido.", {
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  return result.data;
}

export interface Pagination {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePagination(query: Record<string, unknown>): Pagination {
  return {
    limit: clampInt(toInt(query.limit), DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: clampInt(toInt(query.offset), 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function toInt(value: unknown): number {
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : NaN;
  }
  return NaN;
}

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
