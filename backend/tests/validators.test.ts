import { describe, expect, it } from "vitest";
import type { ExtractionOutput } from "../../shared/src/schemas/analysis.js";
import { validateExtraction } from "../src/services/aiAnalysis/validators.js";
import type { Transcript } from "../src/services/transcription/types.js";

const segments = [
  { id: "s001", start_ms: 0, end_ms: 4000, speaker: "Ana", text: "Eu te mando a planilha de produtos até sexta." },
  { id: "s002", start_ms: 4000, end_ms: 9000, speaker: "Marina", text: "Fechado, primeiro web, app depois." },
];
const transcript: Transcript = {
  text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
  segments,
  metadata: { language: "pt", duration_ms: 9000, has_speakers: true, has_timestamps: true, provider: "text", model: null },
};

const ref = (quote: string) => ({ quote, segment_id: null, speaker: null, start_ms: null, end_ms: null });
const base = { confidence: "high" as const, review_status: "pending" as const, reviewer_note: null };

function ex(over: Partial<ExtractionOutput> = {}): ExtractionOutput {
  return {
    summary: "Reunião sobre o portal.",
    participants: [],
    client_needs: [],
    requirements: [
      {
        ...base,
        id: "req_001",
        title: "Web",
        description: "Portal web",
        type: "functional",
        priority: "unknown",
        module_id: null,
        depends_on: [],
        source_refs: [ref("primeiro web, app depois")],
      },
    ],
    modules: [],
    decisions: [
      {
        ...base,
        id: "dec_001",
        description: "Web primeiro",
        status: "confirmed",
        agreed_by: ["Marina"],
        scope_effect: "in_scope",
        source_refs: [ref("Fechado, primeiro web, app depois")],
      },
    ],
    commitments: [
      {
        ...base,
        id: "com_001",
        owner: "Ana",
        owner_side: "client",
        description: "Enviar planilha",
        due_text: "sexta",
        status: "confirmed",
        caveats: null,
        source_refs: [ref("Eu te mando a planilha de produtos até sexta")],
      },
    ],
    tech_suggestions: [],
    limitations: [],
    ...over,
  };
}

describe("validateExtraction", () => {
  it("caso feliz: nada alterado, preenche segment_id/start_ms/speaker da quote", () => {
    const r = validateExtraction(ex(), transcript);
    expect(r.reprocess).toEqual([]);
    expect(r.limitations).toEqual([]);
    expect(r.extraction.decisions[0]!.status).toBe("confirmed");
    expect(r.extraction.commitments[0]!.source_refs[0]).toMatchObject({ segment_id: "s001", speaker: "Ana", start_ms: 0, end_ms: 4000 });
    expect(r.extraction.decisions[0]!.source_refs[0]).toMatchObject({ segment_id: "s002", start_ms: 4000 });
  });

  it("descarta segment_id/start_ms do modelo e deixa null sem segmentos", () => {
    const noSeg = { ...transcript, segments: [] };
    const e = ex();
    e.requirements[0]!.source_refs = [{ quote: "primeiro web, app depois", segment_id: "s999", speaker: "X", start_ms: 123, end_ms: 456 }];
    const r = validateExtraction(e, noSeg);
    expect(r.extraction.requirements[0]!.source_refs[0]).toMatchObject({ segment_id: null, speaker: null, start_ms: null, end_ms: null });
  });

  it("R1: quote inexistente é removida, confiança vira low; sem refs rebaixa decisão/compromisso", () => {
    const e = ex();
    e.decisions[0]!.source_refs = [ref("isso nunca foi dito")];
    e.commitments[0]!.source_refs = [ref("também inventado")];
    e.requirements[0]!.source_refs = [ref("primeiro web, app depois"), ref("trecho falso")];
    const r = validateExtraction(e, transcript);
    expect(r.reprocess).toEqual([]);
    expect(r.extraction.decisions[0]).toMatchObject({ status: "pending_validation", confidence: "low", source_refs: [] });
    expect(r.extraction.commitments[0]).toMatchObject({ status: "tentative", confidence: "low" });
    expect(r.extraction.requirements[0]).toMatchObject({ confidence: "low" });
    expect(r.extraction.requirements[0]!.source_refs).toHaveLength(1);
    expect(r.limitations.length).toBeGreaterThanOrEqual(3);
  });

  it("R1: normaliza espaços, caixa e pontuação final", () => {
    const e = ex();
    e.requirements[0]!.source_refs = [ref("  PRIMEIRO   web, app depois. ")];
    const r = validateExtraction(e, transcript);
    expect(r.extraction.requirements[0]!.confidence).toBe("high");
    expect(r.extraction.requirements[0]!.source_refs[0]!.segment_id).toBe("s002");
  });

  it("R2: ids duplicados e referências inexistentes pedem reprocesso", () => {
    const e = ex();
    e.commitments[0]!.id = "dec_001";
    e.requirements[0]!.module_id = "mod_99";
    e.requirements[0]!.depends_on = ["req_777"];
    e.modules = [{ id: "mod_01", name: "M", description: "d", requirement_ids: ["req_404"], complexity: "S", complexity_rationale: null }];
    const r = validateExtraction(e, transcript);
    const text = r.reprocess.join("\n");
    expect(text).toContain("duplicados: dec_001");
    expect(text).toContain("mod_99");
    expect(text).toContain("req_777");
    expect(text).toContain("req_404");
  });

  it("R3: decisão confirmed com confidence low vira pending_validation", () => {
    const e = ex();
    e.decisions[0]!.confidence = "low";
    const r = validateExtraction(e, transcript);
    expect(r.extraction.decisions[0]!.status).toBe("pending_validation");
    expect(r.reprocess).toEqual([]);
    expect(r.limitations.join(" ")).toContain("dec_001");
  });

  it("R4: compromisso confirmed sem owner vira tentative", () => {
    const e = ex();
    e.commitments[0]!.owner = "  ";
    const r = validateExtraction(e, transcript);
    expect(r.extraction.commitments[0]!.status).toBe("tentative");
    expect(r.limitations.join(" ")).toContain("com_001");
  });

  it("R5: summary vazio ou > 1200 caracteres pede reprocesso", () => {
    expect(validateExtraction(ex({ summary: " " }), transcript).reprocess.join()).toContain("summary");
    expect(validateExtraction(ex({ summary: "x".repeat(1201) }), transcript).reprocess.join()).toContain("1201");
    expect(validateExtraction(ex({ summary: "x".repeat(1200) }), transcript).reprocess).toEqual([]);
  });

  it("R6: sem requisitos em transcrição > 500 palavras pede reprocesso com dica", () => {
    const long = { ...transcript, text: Array(501).fill("palavra").join(" ") };
    expect(validateExtraction(ex({ requirements: [] }), long).reprocess.join()).toContain("funcionalidades");
    expect(validateExtraction(ex({ requirements: [] }), transcript).reprocess).toEqual([]);
  });

  it("não muta a entrada", () => {
    const e = ex();
    e.decisions[0]!.confidence = "low";
    validateExtraction(e, transcript);
    expect(e.decisions[0]!.status).toBe("confirmed");
  });
});
