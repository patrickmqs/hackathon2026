// Teste ao vivo (chama a OpenAI): auditoria de lacunas + resumo (docs/AI_PIPELINE.md §11, testes 4, 5, 9, 10).
// Rode com: AI_TESTS=1 npx vitest run tests/ai/gap-summary.live.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExtractionOutput, GapAuditOutput, MeetingSummaryOutput } from "../../../shared/src/schemas/analysis.js";
import { gapAuditDetailed } from "../../src/services/aiAnalysis/gapAudit.js";
import { summarizeDetailed } from "../../src/services/aiAnalysis/summarize.js";
import { numbersNotFound, quoteInTranscript, type SummaryAnalysis } from "../../src/services/aiAnalysis/summaryValidator.js";
import type { Transcript } from "../../src/services/transcription/types.js";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const text = fs.readFileSync(path.join(root, "sample_data", "sample_transcript_pt.txt"), "utf8");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "fixtures", "ai", f), "utf8"));

const transcript: Transcript = {
  text,
  segments: [],
  metadata: { language: "pt", duration_ms: null, has_speakers: true, has_timestamps: false, provider: "text", model: null },
};
const extraction = ExtractionOutput.parse(readJson("sample_extraction.json"));
const fixtureGap = GapAuditOutput.parse(readJson("sample_gap_audit.json"));
const gold = JSON.parse(fs.readFileSync(path.join(root, "sample_data", "sample_analysis_expected.json"), "utf8")).expected;

const quoteFidelity = (quotes: string[]) => quotes.filter((q) => quoteInTranscript(q, text)).length / Math.max(quotes.length, 1);

describe.skipIf(!process.env.AI_TESTS)("IA7/IA17 ao vivo: auditoria de lacunas e resumo", () => {
  it("gap_audit: detecta a contradição plantada e rebaixa o que a transcrição não sustenta", async () => {
    // Extração com dois erros plantados: decisão hesitante e compromisso condicional marcados como confirmed.
    const flawed: ExtractionOutput = {
      ...extraction,
      decisions: extraction.decisions.map((d) => (d.id === "dec_03" ? { ...d, status: "confirmed", confidence: "high" } : d)),
      commitments: extraction.commitments.map((c) => (c.id === "com_03" ? { ...c, status: "confirmed", caveats: null } : c)),
    };
    const { data, usage, latencyMs } = await gapAuditDetailed(transcript, flawed);
    console.info(`gap_audit: ${latencyMs} ms, ${usage.input_tokens}/${usage.output_tokens} tokens, ${data.open_issues.length} pendências, ${data.downgrades.length} rebaixamentos`);

    expect(GapAuditOutput.safeParse(data).success).toBe(true);

    // §11.4: contradição plantada em open_issues(type=contradiction), com as duas afirmações citadas.
    const anchors = gold.contradictions[0].anchors as string[];
    const contradiction = data.open_issues.find(
      (i) => i.type === "contradiction" && anchors.every((a) => i.source_refs.some((r) => quoteInTranscript(r.quote, a) || quoteInTranscript(a, r.quote))),
    );
    expect(contradiction, JSON.stringify(data.open_issues.map((i) => [i.id, i.type]))).toBeDefined();

    // §11.5: o compromisso condicional não fica confirmed; a decisão hesitante também é rebaixada.
    expect(data.downgrades.find((d) => d.id === "com_03")?.to).toBe("tentative");
    expect(data.downgrades.find((d) => d.id === "dec_03")?.to).toBe("pending_validation");
    // Nada confirmado de fato é rebaixado.
    for (const id of ["dec_01", "dec_02", "com_01", "com_02"]) expect(data.downgrades.map((d) => d.id)).not.toContain(id);

    // Checklist §7: informações ausentes do gabarito aparecem como pendências.
    const all = data.open_issues.map((i) => `${i.description} ${i.suggested_question ?? ""}`.toLowerCase()).join(" | ");
    const missing = [/volume|quantos|simult/, /erp.*(api|vers)|api.*erp/, /prazo|data-alvo|evento/, /orçamento|investimento|faixa/, /quem (decide|aprova)|decisor|aprov/];
    expect(missing.filter((m) => m.test(all)).length).toBeGreaterThanOrEqual(4);

    // IDs únicos e fidelidade das citações.
    expect(new Set(data.open_issues.map((i) => i.id)).size).toBe(data.open_issues.length);
    expect(quoteFidelity(data.open_issues.flatMap((i) => i.source_refs.map((r) => r.quote)))).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  it("summarize: cumpre §11.9 e §11.10 com a análise de exemplo", async () => {
    const analysis: SummaryAnalysis = { ...extraction, open_issues: fixtureGap.open_issues };
    const res = await summarizeDetailed(transcript, analysis, "analysis");
    const s = res.summary;
    console.info(`summarize: ${res.attempts} tentativa(s), ${res.usage.input_tokens}/${res.usage.output_tokens} tokens`);
    console.info(JSON.stringify(s, null, 1));

    // §11.9: schema, limites, fidelidade, sem número inventado.
    expect(MeetingSummaryOutput.safeParse(s).success).toBe(true);
    expect(s.headline.length).toBeLessThanOrEqual(140);
    expect(s.executive_summary.length).toBeLessThanOrEqual(700);
    expect(s.topics.length).toBeGreaterThanOrEqual(3);
    expect(s.topics.length).toBeLessThanOrEqual(8);
    expect(quoteFidelity(s.topics.flatMap((t) => t.source_refs.map((r) => r.quote)))).toBeGreaterThanOrEqual(0.9);
    expect(numbersNotFound(s, text, analysis)).toEqual([]);

    // §11.10: só confirmadas em key_decisions; pendentes em pending_decisions; contradição em open_points.
    const s2 = gold.summary;
    expect(s.key_decisions.sort()).toEqual(["dec_01", "dec_02"]);
    expect(s.pending_decisions.sort()).toEqual(["dec_03", "dec_04"]);
    expect(s2.key_decisions_must_include).toHaveLength(2);
    expect(s.open_points).toContain("iss_01");
    // A sugestão do fornecedor não acolhida (tech_01) não vira decisão nem próximo passo.
    for (const list of [s.key_decisions, s.pending_decisions, s.next_steps]) expect(list).not.toContain("tech_01");
    expect(s.next_steps.every((id) => id.startsWith("com_"))).toBe(true);

    // O texto não promove pendências nem a sugestão offline.
    const prose = [s.headline, s.executive_summary, ...s.topics.flatMap((t) => [t.title, t.summary])].join(" ");
    expect(prose).not.toMatch(/\b(dec|com|iss|tech)_\d+/);
    if (/offline/i.test(prose)) expect(prose).toMatch(/futur|em aberto|sem compromisso|não (foi )?(acolh|confirm)|depois/i);
  }, 120_000);
});
