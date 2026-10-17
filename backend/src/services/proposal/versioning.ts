import { createHash } from "node:crypto";

export type VersionStatus = "draft" | "approved" | "superseded";

// Ordena chaves recursivamente para uma forma canônica determinística (sem espaços, UTF-8).
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortKeysDeep(source[key]);
    }
    return out;
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

// SHA-256 hex do JSON canônico — AI_PIPELINE §8.
export function contentHash(content: unknown): string {
  return createHash("sha256").update(canonicalStringify(content)).digest("hex");
}

// Transições de status de versão — ARCHITECTURE §4.
// draft ──(approve)──▶ approved ──(supersede)──▶ superseded
export function nextVersionStatus(
  current: VersionStatus,
  event: "approve" | "supersede",
): VersionStatus {
  if (event === "approve") {
    return current === "draft" ? "approved" : current;
  }
  return current === "approved" ? "superseded" : current;
}

export function isEditable(status: VersionStatus): boolean {
  return status === "draft";
}
