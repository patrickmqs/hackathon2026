import { describe, it, expect } from "vitest";
import { DomainError, HTTP_STATUS_BY_CODE, toErrorEnvelope } from "../../src/core/errors.js";

describe("core/errors — mapeamento e envelope (B1)", () => {
  it("mapeia códigos para status HTTP (API_SPEC §2)", () => {
    expect(HTTP_STATUS_BY_CODE.VALIDATION_ERROR).toBe(400);
    expect(HTTP_STATUS_BY_CODE.UPLOAD_INVALID).toBe(400);
    expect(HTTP_STATUS_BY_CODE.DEMO_USER_REQUIRED).toBe(401);
    expect(HTTP_STATUS_BY_CODE.NOT_FOUND).toBe(404);
    expect(HTTP_STATUS_BY_CODE.PROPOSAL_VERSION_IMMUTABLE).toBe(409);
    expect(HTTP_STATUS_BY_CODE.RECIPIENT_INVALID).toBe(422);
    expect(HTTP_STATUS_BY_CODE.INTERNAL_ERROR).toBe(500);
  });

  it("DomainError deriva o status do código", () => {
    const e = new DomainError("PROPOSAL_HASH_MISMATCH", "hash difere", { version: 2 });
    expect(e.code).toBe("PROPOSAL_HASH_MISMATCH");
    expect(e.httpStatus).toBe(409);
    expect(e.details).toEqual({ version: 2 });
  });

  it("toErrorEnvelope serializa DomainError no formato padrão", () => {
    const e = new DomainError("ANALYSIS_REVIEW_INCOMPLETE", "revisão incompleta");
    expect(toErrorEnvelope(e, "req_1")).toEqual({
      error: {
        code: "ANALYSIS_REVIEW_INCOMPLETE",
        message: "revisão incompleta",
        details: null,
        request_id: "req_1",
      },
    });
  });

  it("toErrorEnvelope não vaza detalhes de erro desconhecido", () => {
    const env = toErrorEnvelope(new Error("segredo interno sensível"), "req_2");
    expect(env.error.code).toBe("INTERNAL_ERROR");
    expect(env.error.message).not.toContain("segredo");
    expect(env.error.details).toBeNull();
  });
});
