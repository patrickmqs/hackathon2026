import { z } from "zod";

// Códigos de erro do envelope padrão — API_SPEC §2.
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UPLOAD_INVALID",
  "MEETING_INPUT_REQUIRED",
  "DEMO_USER_REQUIRED",
  "NOT_FOUND",
  "MEETING_NOT_READY",
  "ANALYSIS_REVIEW_INCOMPLETE",
  "ANALYSIS_LOCKED",
  "PROPOSAL_VERSION_IMMUTABLE",
  "PROPOSAL_HASH_MISMATCH",
  "PROPOSAL_ALREADY_APPROVED",
  "APPROVAL_REQUIRED",
  "APPROVAL_SUPERSEDED",
  "IDEMPOTENCY_CONFLICT",
  "CHANNEL_NOT_RETRYABLE",
  "RECIPIENT_INVALID",
  "AI_PROVIDER_ERROR",
  "AI_PROVIDER_NOT_CONFIGURED",
  "PDF_RENDER_FAILED",
  "INTERNAL_ERROR",
] as const;

export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

// Envelope de erro — API_SPEC §2.
export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).nullable().optional(),
    request_id: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
