import type { NextFunction, Request, Response } from "express";
import { DomainError, toErrorEnvelope } from "../core/errors.js";

// Normaliza erros de infraestrutura (multer/express.json) em DomainError antes de
// serializar no envelope padrão. Erros desconhecidos viram INTERNAL_ERROR sem vazar detalhes.
function normalizeError(err: unknown): unknown {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE") {
      return new DomainError("UPLOAD_INVALID", "Arquivo de áudio excede o limite permitido.");
    }
  }
  if (
    err &&
    typeof err === "object" &&
    "type" in err &&
    (err as { type?: string }).type === "entity.parse.failed"
  ) {
    return new DomainError("VALIDATION_ERROR", "JSON inválido no corpo da requisição.");
  }
  return err;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (res.locals.requestId as string | undefined) ?? "req_unknown";
  const normalized = normalizeError(err);
  const envelope = toErrorEnvelope(normalized, requestId);
  const status = normalized instanceof DomainError ? normalized.httpStatus : 500;
  res.status(status).json(envelope);
}
