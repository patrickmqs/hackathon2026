import { describe, expect, it } from "vitest";
import type { ExtractionOutput, GapAuditOutput } from "../../shared/src/schemas/analysis.js";
import { validateExtraction, validateGapAudit } from "../src/services/aiAnalysis/validators.js";
import type { Transcript } from "../src/services/transcription/types.js";

const segments = [
  { id: "s001", start_ms: 0, end_ms: 4000, speaker: "Ana", text: "Eu te mando a planilha de produtos até sexta." },
  { id: "s002", start_ms: 4000, end_ms: 9000, speaker: "Marina", text: "Fechado, primeiro web, app depois." },
  { id: "s003", start_ms: 9000, end_ms: 12000, speaker: "Ana", text: "O catálogo precisa carregar rápido." },
];
const transcript: Transcript = {
  text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
  segments,
  metadata: { language: "pt", duration_ms: 12000, has_speakers: true, has_timestamps: true, provider: "text", model: null },
};

const ref = (quote: string) => ({ quote, segment_id: null, speaker: null, start_ms: null, end_ms: null });
const base = { confidence: "high" as const, review_status: "pending" as const, reviewer_note: null };

function ex(over: Partial<ExtractionOutput> = {}): ExtractionOutput {
  return {
    summary: "Reunião.",
    participants: [],
    client_needs: [],
    requirements: [
      { ...base, id: "req_001", title: "Web", description: "d", type: "functional", priority: "unknown", module_id: null, depends_on: [], source_refs: [ref("primeiro web, app depois")] },
    ],
    modules: [],
    decisions: [
      { ...base, id: "dec_001", description: "Web primeiro", status: "confirmed", agreed_by: ["Marina"], scope_effect: "in_scope", source_refs: [ref("Fechado, primeiro web, app depois")] },
    ],
    commitments: [
      { ...base, id: "com_001", owner: "Ana", owner_side: "client", description: "Enviar", due_text: "sexta", status: "confirmed", caveats: null, source_refs: [ref("Eu te mando a planilha de produtos até sexta")] },
    ],
    tech_suggestions: [],
    limitations: [],
    ...over,
  };
}

describe("achado 4: citações frouxas", () => {
  const withQuote = (q: string) => ex({ requirements: [{ ...ex().requirements[0]!, source_refs: [ref(q)] }] });

  it.each(["web", "Fechado", "até"])("rejeita quote curta demais: %s", (q) => {
    const r = validateExtraction(withQuote(q), transcript);
    expect(r.extraction.requirements[0]!.source_refs).toEqual([]);
  });

  it("aceita quote curta com >= 12 caracteres, e com >= 3 palavras", () => {
    expect(validateExtraction(withQuote("primeiro web"), transcript).extraction.requirements[0]!.source_refs).toHaveLength(1); // 12 chars
    expect(validateExtraction(withQuote("rápido"), transcript).extraction.requirements[0]!.source_refs).toHaveLength(0);
    expect(validateExtraction(withQuote("app depois."), transcript).extraction.requirements[0]!.source_refs).toHaveLength(0); // 10 chars, 2 palavras
    expect(validateExtraction(withQuote("é de um"), transcript).extraction.requirements[0]!.source_refs).toHaveLength(0);
  });

  it("exige fronteira de palavra (não casa no meio de palavra)", () => {
    const r = validateExtraction(withQuote("rimeiro web, app depois"), transcript);
    expect(r.extraction.requirements[0]!.source_refs).toEqual([]);
    const r2 = validateExtraction(withQuote("primeiro web, app depoi"), transcript);
    expect(r2.extraction.requirements[0]!.source_refs).toEqual([]);
  });

  it('não aceita prefixo "Nome:"', () => {
    const r = validateExtraction(withQuote("Marina: Fechado, primeiro web, app depois"), transcript);
    expect(r.extraction.requirements[0]!.source_refs).toEqual([]);
    expect(r.extraction.requirements[0]!.confidence).toBe("low");
  });
});

describe("achado 5: rebaixamento", () => {
  it.each(["N/A", "desconhecido", "a definir", "?", "n/a", "A Definir"])("owner %s conta como sem dono", (owner) => {
    const e = ex();
    e.commitments[0]!.owner = owner;
    const r = validateExtraction(e, transcript);
    expect(r.extraction.commitments[0]!.status).toBe("tentative");
  });

  it("decisão confirmed com agreed_by vazio vira pending_validation", () => {
    const e = ex();
    e.decisions[0]!.agreed_by = [];
    const r = validateExtraction(e, transcript);
    expect(r.extraction.decisions[0]!.status).toBe("pending_validation");
    expect(r.limitations.join(" ")).toMatch(/dec_001/);
  });

  it("agreed_by só com strings vazias também rebaixa", () => {
    const e = ex();
    e.decisions[0]!.agreed_by = ["  "];
    expect(validateExtraction(e, transcript).extraction.decisions[0]!.status).toBe("pending_validation");
  });
});

describe("achado 3: validateGapAudit", () => {
  const issue = (over: Record<string, unknown> = {}) => ({
    ...base,
    id: "iss_01",
    type: "missing_info" as const,
    description: "Falta volume",
    impact: ["effort" as const],
    suggested_question: "Quantos usuários?",
    related_ids: ["req_001"],
    source_refs: [ref("O catálogo precisa carregar rápido")],
    ...over,
  });
  const audit = (issues: ReturnType<typeof issue>[], downgrades: GapAuditOutput["downgrades"] = []): GapAuditOutput => ({
    open_issues: issues,
    downgrades,
    additional_limitations: [],
  });

  it("caso feliz: preenche segment_id/speaker/tempos e não reprocessa", () => {
    const r = validateGapAudit(audit([issue()]), transcript, ex());
    expect(r.reprocess).toEqual([]);
    expect(r.audit.open_issues[0]!.source_refs[0]).toMatchObject({ segment_id: "s003", speaker: "Ana", start_ms: 9000, end_ms: 12000 });
  });

  it("descarta valores do modelo para segment_id/start_ms", () => {
    const i = issue({ source_refs: [{ quote: "O catálogo precisa carregar rápido", segment_id: "zzz", speaker: "X", start_ms: 1, end_ms: 2 }] });
    const r = validateGapAudit(audit([i]), transcript, ex());
    expect(r.audit.open_issues[0]!.source_refs[0]).toMatchObject({ segment_id: "s003", speaker: "Ana", start_ms: 9000 });
  });

  it("quote inexistente é removida, confiança vira low e vai para limitations", () => {
    const r = validateGapAudit(audit([issue({ source_refs: [ref("frase que ninguém disse nunca")] })]), transcript, ex());
    expect(r.audit.open_issues[0]!.source_refs).toEqual([]);
    expect(r.audit.open_issues[0]!.confidence).toBe("low");
    expect(r.limitations.join(" ")).toMatch(/iss_01/);
    expect(r.reprocess).toEqual([]);
  });

  it("related_ids inexistente reprocessa", () => {
    const r = validateGapAudit(audit([issue({ related_ids: ["req_999"] })]), transcript, ex());
    expect(r.reprocess.join(" ")).toMatch(/req_999/);
  });

  it("related_ids pode apontar para outra pendência do próprio audit", () => {
    const r = validateGapAudit(audit([issue(), issue({ id: "iss_02", related_ids: ["iss_01"] })]), transcript, ex());
    expect(r.reprocess).toEqual([]);
  });

  it("ids de pendências duplicados reprocessam", () => {
    const r = validateGapAudit(audit([issue(), issue()]), transcript, ex());
    expect(r.reprocess.join(" ")).toMatch(/iss_01/);
  });

  it("downgrade para id inexistente reprocessa", () => {
    const r = validateGapAudit(audit([], [{ id: "dec_999", to: "pending_validation", reason: "x" }]), transcript, ex());
    expect(r.reprocess.join(" ")).toMatch(/dec_999/);
  });
});
