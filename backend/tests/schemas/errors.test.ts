import { describe, it, expect } from "vitest";
import { ErrorEnvelope, ErrorCode, ERROR_CODES } from "../../src/schemas/errors.js";
import errorExamples from "../../../docs/examples/error.example.json";

describe("schemas/errors — envelope padrão (API_SPEC §2)", () => {
  it("aceita o envelope mínimo", () => {
    const env = {
      error: { code: "INTERNAL_ERROR", message: "x", details: null, request_id: "req_1" },
    };
    expect(ErrorEnvelope.safeParse(env).success).toBe(true);
  });

  it("rejeita código de erro desconhecido", () => {
    const env = { error: { code: "NAO_EXISTE", message: "x", request_id: "req_1" } };
    expect(ErrorEnvelope.safeParse(env).success).toBe(false);
  });

  it("rejeita envelope sem request_id", () => {
    const env = { error: { code: "NOT_FOUND", message: "x" } };
    expect(ErrorEnvelope.safeParse(env).success).toBe(false);
  });

  it("todos os códigos do mapa são aceitos pelo schema", () => {
    for (const code of ERROR_CODES) {
      expect(ErrorCode.safeParse(code).success).toBe(true);
    }
  });

  it("valida todos os exemplos de docs/examples/error.example.json", () => {
    const examples = errorExamples as Record<string, unknown>;
    const checked = Object.entries(examples).filter(([key]) => key !== "_note");
    expect(checked.length).toBeGreaterThan(0);
    for (const [key, value] of checked) {
      const parsed = ErrorEnvelope.safeParse(value);
      expect(parsed.success, `${key}: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });
});
