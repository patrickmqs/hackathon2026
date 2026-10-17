import type { ErrorCode, ErrorEnvelope } from "../schemas/errors.js";

// Mapa código de erro → status HTTP — API_SPEC §2.
export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UPLOAD_INVALID: 400,
  MEETING_INPUT_REQUIRED: 400,
  DEMO_USER_REQUIRED: 401,
  NOT_FOUND: 404,
  MEETING_NOT_READY: 409,
  ANALYSIS_REVIEW_INCOMPLETE: 409,
  ANALYSIS_LOCKED: 409,
  PROPOSAL_VERSION_IMMUTABLE: 409,
  PROPOSAL_HASH_MISMATCH: 409,
  PROPOSAL_ALREADY_APPROVED: 409,
  APPROVAL_REQUIRED: 409,
  APPROVAL_SUPERSEDED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  CHANNEL_NOT_RETRYABLE: 409,
  RECIPIENT_INVALID: 422,
  AI_PROVIDER_ERROR: 500,
  AI_PROVIDER_NOT_CONFIGURED: 500,
  PDF_RENDER_FAILED: 500,
  INTERNAL_ERROR: 500,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.httpStatus = HTTP_STATUS_BY_CODE[code];
    this.details = details;
  }
}

// Converte qualquer erro no envelope padrão. Erros desconhecidos não vazam detalhes internos.
export function toErrorEnvelope(error: unknown, requestId: string): ErrorEnvelope {
  if (error instanceof DomainError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
        request_id: requestId,
      },
    };
  }
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "Erro interno inesperado.",
      details: null,
      request_id: requestId,
    },
  };
}
