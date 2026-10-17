// Teste ao vivo (chama a OpenAI): AI_TESTS=1 npm run test:ai. Gabarito: sample_data (AI_PIPELINE §11).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extract } from "../../src/services/aiAnalysis/extract.js";
import { normalizeQuote, validateExtraction } from "../../src/services/aiAnalysis/validators.js";
import type { Transcript, TranscriptSegment } from "../../src/services/transcription/types.js";

const dir = path.resolve(import.meta.dirname, "../../../sample_data");
const text = fs.readFileSync(path.join(dir, "sample_transcript_pt.txt"), "utf8");
const gold = JSON.parse(fs.readFileSync(path.join(dir, "sample_analysis_expected.json"), "utf8"));
const e = gold.expected;

// Transcrição colada: um segmento por fala "Nome: texto", sem tempo.
const segments: TranscriptSegment[] = text
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l, i) => {
    const m = /^([^:]{1,40}):\s*(.*)$/.exec(l);
    return {
      id: `s${String(i + 1).padStart(3, "0")}`,
      start_ms: null,
      end_ms: null,
      speaker: m ? m[1]! : null,
      text: m ? m[2]! : l,
    };
  });
const transcript: Transcript = {
  text,
  segments,
  metadata: { language: "pt", duration_ms: null, has_speakers: true, has_timestamps: false, provider: "text", model: null },
};

describe.skipIf(!process.env.AI_TESTS)("extract (ao vivo) contra o gabarito", () => {
  it("atende os limiares do gabarito", { timeout: 180_000 }, async () => {
    const raw = await extract(transcript);
    const { extraction: out, limitations } = validateExtraction(raw, transcript);
    fs.mkdirSync(path.resolve(import.meta.dirname, "../../logs"), { recursive: true });
    fs.writeFileSync(path.resolve(import.meta.dirname, "../../logs/extract_live_last.json"), JSON.stringify({ raw, out }, null, 2));

    const norm = normalizeQuote;
    // Um item "cobre" a âncora se alguma citação dele cai na mesma fala (linha) da âncora.
    const lines = text.split(/\r?\n/).map((l) => norm(l));
    const has = (items: { source_refs: { quote: string }[] }[], anchor: string) => {
      const a = norm(anchor);
      const hit = lines.filter((l) => l.includes(a)); // a âncora pode ocorrer em mais de uma fala
      return items.find((i) =>
        i.source_refs.some((r) => {
          const q = norm(r.quote);
          return q.length > 0 && hit.some((l) => l.includes(q));
        }),
      );
    };

    const checks: [string, boolean][] = [
      ...e.decisions.map((d: { key: string; anchor: string }) => [d.key, !!has(out.decisions, d.anchor)] as [string, boolean]),
      ...e.commitments.map((c: { key: string; anchor: string }) => [c.key, !!has(out.commitments, c.anchor)] as [string, boolean]),
      ...e.requirements.map((r: { key: string; anchor: string }) => [r.key, !!has(out.requirements, r.anchor)] as [string, boolean]),
      ...e.vague_terms.map((v: { key: string; anchor: string }) => [
        v.key,
        !!has([...out.requirements, ...out.client_needs], v.anchor),
      ] as [string, boolean]),
    ];
    const found = checks.filter(([, ok]) => ok).length / checks.length;
    console.log(`itens do gabarito: ${(found * 100).toFixed(0)}%`, checks.filter(([, ok]) => !ok).map(([k]) => k));
    expect(found).toBeGreaterThanOrEqual(gold.thresholds.min_expected_items_found);

    // Fidelidade das quotes (antes da validação, que remove as inválidas).
    const all = [
      ...raw.client_needs, ...raw.requirements, ...raw.decisions, ...raw.commitments, ...raw.tech_suggestions,
    ].flatMap((i) => i.source_refs);
    const fullText = normalizeQuote(text.replace(/\s+/g, " "));
    const ok = all.filter((r) => fullText.includes(normalizeQuote(r.quote))).length;
    console.log(`quotes literais: ${ok}/${all.length}; limitations do validador: ${limitations.length}`);
    expect(ok / all.length).toBeGreaterThanOrEqual(gold.thresholds.min_quote_fidelity);

    // Sugestão do fornecedor não vira decisão.
    for (const s of e.vendor_suggestions_not_accepted) {
      expect(has(out.decisions, s.anchor), s.key).toBeUndefined();
    }

    // Compromisso condicional não sai confirmed.
    for (const c of e.commitments.filter((x: { must_not_be?: string }) => x.must_not_be)) {
      const item = has(out.commitments, c.anchor);
      if (item) expect((item as { status: string }).status).not.toBe(c.must_not_be);
    }
  });
});
