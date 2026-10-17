import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ExtractionOutput,
  GapAuditOutput,
  MeetingSummaryOutput,
} from "../../shared/src/schemas/analysis.js";
import {
  locateRef,
  normalizeQuote,
  numbersNotFound,
  quoteInTranscript,
  validateSummary,
  type SummaryAnalysis,
} from "../src/services/aiAnalysis/summaryValidator.js";
import type { Transcript } from "../src/services/transcription/types.js";

const root = path.resolve(import.meta.dirname, "..", "..");
const text = fs.readFileSync(path.join(root, "sample_data", "sample_transcript_pt.txt"), "utf8");
const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures", "ai", f), "utf8"));

const transcript: Transcript = {
  text,
  segments: [],
  metadata: { language: "pt", duration_ms: null, has_speakers: true, has_timestamps: false, provider: "text", model: null },
};
const extraction = ExtractionOutput.parse(fx("sample_extraction.json"));
const gap = GapAuditOutput.parse(fx("sample_gap_audit.json"));
const analysis: SummaryAnalysis = { ...extraction, open_issues: gap.open_issues };

const ref = (quote: string) => ({ quote, segment_id: null, speaker: null, start_ms: null, end_ms: null });
const topic = (title: string, quote: string) => ({ title, summary: "Resumo curto do tópico.", source_refs: [ref(quote)] });

function good(): MeetingSummaryOutput {
  return {
    headline: "Portal B2B de pedidos: primeira fase web e faturamento no ERP",
    executive_summary: "A distribuidora quer um portal de pedidos. Ficou fechado que a primeira fase é web e que o faturamento continua no ERP. Crédito e relatórios seguem pendentes.",
    topics: [
      topic("Problema atual", "os pedidos chegam por WhatsApp e planilha"),
      topic("Faturamento no ERP", "o faturamento continua saindo pelo ERP e o portal só envia o pedido"),
      topic("Crédito", "Os clientes antigos compram direto, sem análise"),
    ],
    key_decisions: ["dec_01", "dec_02"],
    pending_decisions: ["dec_03", "dec_04"],
    next_steps: ["com_01", "com_02", "com_03"],
    open_points: ["iss_01", "iss_02"],
  };
}
const run = (s: MeetingSummaryOutput, basis: "analysis" | "reviewed" = "analysis", a = analysis) =>
  validateSummary(s, { transcript, analysis: a, basis });

describe("normalizeQuote / quoteInTranscript", () => {
  it("ignora caixa, espaços, aspas tipográficas e pontuação nas pontas", () => {
    expect(normalizeQuote("  “Olá,   Mundo!”  ")).toBe("olá,   mundo".replace(/\s+/g, " "));
    expect(quoteInTranscript("PRIMEIRO WEB,  app depois.", text)).toBe(true);
    expect(quoteInTranscript("primeiro mobile, web depois", text)).toBe(false);
    expect(quoteInTranscript("   ", text)).toBe(false);
  });
});

describe("fixtures de IA", () => {
  it("sample_extraction/gap_audit validam nos schemas e têm quotes literais", () => {
    const refs = [
      ...[extraction.client_needs, extraction.requirements, extraction.decisions, extraction.commitments, extraction.tech_suggestions, gap.open_issues]
        .flat()
        .flatMap((i) => i.source_refs),
    ];
    expect(refs.length).toBeGreaterThan(20);
    for (const r of refs) expect(quoteInTranscript(r.quote, text), r.quote).toBe(true);
  });

  it("planta 2 decisões confirmadas, 2 pendentes, 3 compromissos e a contradição", () => {
    expect(extraction.decisions.filter((d) => d.status === "confirmed")).toHaveLength(2);
    expect(extraction.decisions.filter((d) => d.status === "pending_validation")).toHaveLength(2);
    expect(extraction.commitments.map((c) => c.status)).toEqual(["confirmed", "confirmed", "conditional"]);
    expect(gap.open_issues.some((i) => i.type === "contradiction")).toBe(true);
  });
});

describe("validateSummary", () => {
  it("aceita um resumo correto", () => {
    const v = run(good());
    expect(v.violations).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.limitations).toEqual([]);
  });

  it("id inexistente ou de tipo errado exige reprocessar", () => {
    const s = good();
    s.open_points.push("iss_99");
    s.next_steps.push("dec_01");
    const v = run(s);
    expect(v.ok).toBe(false);
    expect(v.violations.join("\n")).toMatch(/open_points.*iss_99/);
    expect(v.violations.join("\n")).toMatch(/next_steps.*dec_01/);
  });

  it("move decisão para a lista correta sem reprocessar e registra", () => {
    const s = good();
    s.key_decisions = ["dec_01", "dec_02", "dec_03"]; // dec_03 é pendente
    s.pending_decisions = ["dec_04"];
    const v = run(s);
    expect(v.ok).toBe(true);
    expect(v.summary.key_decisions.sort()).toEqual(["dec_01", "dec_02"]);
    expect(v.summary.pending_decisions.sort()).toEqual(["dec_03", "dec_04"]);
    expect(v.limitations.join(" ")).toMatch(/dec_03/);
  });

  it("completa decisões omitidas a partir da análise", () => {
    const s = good();
    s.key_decisions = ["dec_01"];
    s.pending_decisions = [];
    const v = run(s);
    expect(v.ok).toBe(true);
    expect(v.summary.key_decisions).toEqual(["dec_01", "dec_02"]);
    expect(v.summary.pending_decisions).toEqual(["dec_03", "dec_04"]);
    expect(v.limitations.join(" ")).toMatch(/omitidas/);
  });

  it("limites de tamanho exigem reprocessar", () => {
    const s = good();
    s.headline = "x".repeat(141);
    s.executive_summary = "y".repeat(701);
    const v = run(s);
    expect(v.ok).toBe(false);
    expect(v.violations.join("\n")).toMatch(/headline/);
    expect(v.violations.join("\n")).toMatch(/executive_summary/);
  });

  it("tópico sem source_ref exige reprocessar", () => {
    const s = good();
    s.topics[0]!.source_refs = [];
    const v = run(s);
    expect(v.ok).toBe(false);
    expect(v.violations.join("\n")).toMatch(/não tem source_refs/);
  });

  it("remove quote inválida; descarta tópico sem ref válida; <3 tópicos reprocessa", () => {
    const s = good();
    s.topics[0]!.source_refs.push(ref("frase que ninguém disse"));
    let v = run(s);
    expect(v.ok).toBe(true);
    expect(v.summary.topics[0]!.source_refs).toHaveLength(1);
    expect(v.limitations.join(" ")).toMatch(/não encontrada/);

    s.topics[1]!.source_refs = [ref("outra frase inventada")];
    v = run(s);
    expect(v.summary.topics).toHaveLength(2);
    expect(v.ok).toBe(false);
    expect(v.violations.join("\n")).toMatch(/topics deve ter/);
  });

  it("mais de 8 tópicos exige reprocessar", () => {
    const s = good();
    s.topics = Array.from({ length: 9 }, (_, i) => topic(`T${i}`, "primeiro web, app depois"));
    expect(run(s).ok).toBe(false);
  });

  it("número fora da transcrição e da análise exige reprocessar", () => {
    const s = good();
    s.executive_summary += " O orçamento é de 250 mil reais e 12 telas.";
    const v = run(s);
    expect(v.ok).toBe(false);
    expect(v.violations.join("\n")).toMatch(/250, 12/);
    expect(numbersNotFound(good(), text, analysis)).toEqual([]);
  });

  it("número presente na análise é aceito; dígitos de ids não contam como evidência", () => {
    const a: SummaryAnalysis = { ...analysis, decisions: analysis.decisions.map((d, i) => (i === 0 ? { ...d, description: `${d.description} Prazo de 90 dias.` } : d)) };
    const s = good();
    s.executive_summary += " Prazo de 90 dias.";
    expect(run(s, "analysis", a).ok).toBe(true);
    s.executive_summary += " Item 99.";
    expect(run(s, "analysis", a).ok).toBe(false);
    const withIdDigits = good();
    withIdDigits.headline = "Quatro decisões (04) no portal";
    expect(numbersNotFound(withIdDigits, "sem números", analysis)).toEqual(["04"]);
  });

  it("basis=reviewed remove ids de itens rejected/pending e não exige os não revisados", () => {
    const a: SummaryAnalysis = {
      ...analysis,
      decisions: analysis.decisions.map((d) =>
        d.id === "dec_01" ? { ...d, review_status: "confirmed" } : d.id === "dec_02" ? { ...d, review_status: "rejected" } : { ...d, review_status: "edited" },
      ),
      commitments: analysis.commitments.map((c) => (c.id === "com_03" ? { ...c, review_status: "pending" } : { ...c, review_status: "confirmed" })),
      open_issues: analysis.open_issues.map((i) => ({ ...i, review_status: i.id === "iss_02" ? "rejected" : "confirmed" })),
    };
    const v = run(good(), "reviewed", a);
    expect(v.ok).toBe(true);
    expect(v.summary.key_decisions).toEqual(["dec_01"]);
    expect(v.summary.next_steps).toEqual(["com_01", "com_02"]);
    expect(v.summary.open_points).toEqual(["iss_01"]);
    expect(v.limitations.join(" ")).toMatch(/dec_02/);
  });

  it("preenche segment_id/speaker/tempo a partir dos segmentos; sem segmentos, null", () => {
    const withSegs: Transcript = {
      ...transcript,
      segments: [
        { id: "s001", start_ms: 0, end_ms: 1000, speaker: "Rafael Costa", text: "Pessoal, bom dia." },
        { id: "s002", start_ms: 1000, end_ms: 5000, speaker: "Ana Souza", text: "Isso, pode ser. Primeiro web, app depois." },
      ],
    };
    expect(locateRef(ref("primeiro web, app depois"), withSegs)).toEqual({
      quote: "primeiro web, app depois", segment_id: "s002", speaker: "Ana Souza", start_ms: 1000, end_ms: 5000,
    });
    expect(locateRef({ ...ref("primeiro web, app depois"), segment_id: "x", speaker: "y" }, transcript)).toMatchObject({ segment_id: null, speaker: null });
  });
});

describe("revisão B: números", () => {
  const sumWith = (headline: string): MeetingSummaryOutput => ({ ...good(), headline });
  const nf = (headline: string, transcriptText: string, a: SummaryAnalysis = analysis) => numbersNotFound(sumWith(headline), transcriptText, a);

  it("número colado a unidade não é partido ('10h' != '1', '30min' != '3', '500mb' != '50')", () => {
    expect(nf("Reunião de 10h", "começamos às 10 da manhã")).toEqual([]);
    expect(nf("Chamada de 30min", "foram 30 minutos")).toEqual([]);
    expect(nf("Limite de 500mb", "upload de 500 megas")).toEqual([]);
    // número inventado com unidade continua sendo pego
    expect(nf("Reunião de 99h", "começamos às 10 da manhã")).toEqual(["99"]);
  });

  it("milhar: '20.000' é um número só", () => {
    expect(nf("Cerca de 20000 pedidos", "são uns 20.000 pedidos por mês")).toEqual([]);
    expect(nf("Cerca de 20.000 pedidos", "são uns 20.000 pedidos por mês")).toEqual([]);
    expect(nf("Cerca de 20 pedidos", "são uns 20.000 pedidos por mês")).toEqual(["20"]);
    expect(nf("Cerca de 20.000 pedidos", "são uns 20 pedidos por mês")).toEqual(["20.000"]);
  });

  it("basis=reviewed: número que só existe em item rejeitado não vale", () => {
    const a: SummaryAnalysis = {
      ...analysis,
      decisions: analysis.decisions.map((d, i) => (i === 0 ? { ...d, description: "Prazo de 777 dias.", review_status: "rejected" } : { ...d, review_status: "confirmed" })),
      commitments: analysis.commitments.map((c) => ({ ...c, review_status: "confirmed" })),
      open_issues: analysis.open_issues.map((i) => ({ ...i, review_status: "confirmed" })),
    };
    const s = good();
    s.executive_summary += " Prazo de 777 dias.";
    expect(run(s, "analysis", a).violations.join(" ")).not.toMatch(/777/);
    const v = run(s, "reviewed", a);
    expect(v.ok).toBe(false);
    expect(v.violations.join(" ")).toMatch(/777/);
  });
});

describe("revisão B: quotes", () => {
  const segs: Transcript = {
    ...transcript,
    text: "Rafael: Pessoal, bom dia.\nAna: Isso, pode ser. Primeiro web,\nAna: app depois.",
    segments: [
      { id: "s001", start_ms: 0, end_ms: 1000, speaker: "Rafael", text: "Pessoal, bom dia." },
      { id: "s002", start_ms: 1000, end_ms: 3000, speaker: "Ana", text: "Isso, pode ser. Primeiro web," },
      { id: "s003", start_ms: 3000, end_ms: 5000, speaker: "Ana", text: "app depois." },
    ],
  };

  it("locateRef localiza quote que atravessa segmentos", () => {
    expect(locateRef(ref("primeiro web, app depois"), segs)).toEqual({
      quote: "primeiro web, app depois", segment_id: "s002", speaker: "Ana", start_ms: 1000, end_ms: 5000,
    });
  });

  it("validateSummary aceita tópico cuja quote atravessa segmentos", () => {
    const s = good();
    s.topics[0] = topic("Fases", "primeiro web, app depois");
    const v = validateSummary(s, { transcript: { ...segs, text: segs.text + "\n" + text }, analysis, basis: "analysis" });
    expect(v.summary.topics[0]!.source_refs[0]!.segment_id).toBe("s002");
    expect(v.limitations.join(" ")).not.toMatch(/Fases/);
  });

  it("quote curta demais é rejeitada (mínimo 12 caracteres ou 3 palavras)", () => {
    expect(quoteInTranscript("web", text)).toBe(false);
    expect(quoteInTranscript("o portal", text)).toBe(false);
    expect(quoteInTranscript("primeiro web, app depois", text)).toBe(true);
  });

  it("quote precisa começar e terminar em fronteira de palavra", () => {
    expect(quoteInTranscript("rimeiro web, app depois", text)).toBe(false);
    expect(quoteInTranscript("primeiro web, app depo", text)).toBe(false);
    expect(quoteInTranscript("primeiro web, app depois", text)).toBe(true);
  });
});
