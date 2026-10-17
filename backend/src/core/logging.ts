import { randomUUID } from "node:crypto";

// Identificador de request no formato `req_<uuid>` — rastreado no envelope de erro
// (API_SPEC §2) e nos logs.
export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, message: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

// Logger estruturado mínimo (JSON por linha), com request_id quando disponível.
// Evita interpolar segredos: quem chama decide o que inclui em `fields`.
export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => log("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => log("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => log("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => log("error", message, fields),
};
