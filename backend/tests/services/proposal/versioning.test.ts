import { describe, it, expect } from "vitest";
import {
  canonicalStringify,
  contentHash,
  nextVersionStatus,
  isEditable,
} from "../../../src/services/proposal/versioning.js";

describe("proposal/versioning — hash canônico e imutabilidade (B8)", () => {
  it("canonicalStringify ordena chaves recursivamente", () => {
    expect(canonicalStringify({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("contentHash é independente da ordem das chaves", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });

  it("contentHash é um sha256 hex de 64 chars", () => {
    expect(contentHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("contentHash muda quando o conteúdo muda", () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });

  it("transições de status: draft→approved→superseded", () => {
    expect(nextVersionStatus("draft", "approve")).toBe("approved");
    expect(nextVersionStatus("approved", "supersede")).toBe("superseded");
  });

  it("versões aprovadas/substituídas são imutáveis", () => {
    expect(nextVersionStatus("approved", "approve")).toBe("approved");
    expect(nextVersionStatus("superseded", "approve")).toBe("superseded");
    expect(nextVersionStatus("draft", "supersede")).toBe("draft");
  });

  it("isEditable é verdadeiro apenas para draft", () => {
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("approved")).toBe(false);
    expect(isEditable("superseded")).toBe(false);
  });
});
