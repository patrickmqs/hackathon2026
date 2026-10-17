// Teste ao vivo (chama a OpenAI, ~3 chamadas): pipeline completo sobre a transcrição de exemplo.
// Rode com: AI_TESTS=1 npx vitest run tests/ai/pipeline.live.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MeetingAnalysis } from "../../../shared/src/schemas/analysis.js";
import { analyzeMeeting } from "../../src/services/aiAnalysis/pipeline.js";
import { normalizeQuote } from "../../src/services/aiAnalysis/validators.js";
import type { Transcript, TranscriptSegment } from "../../src/services/transcription/types.js";

const dir = path.resolve(import.meta.dirname, "../../../sample_data");
const text = fs.readFileSync(path.join(dir, "sample_transcript_pt.txt"), "utf8");
const gold = JSON.parse(fs.readFileSync(path.join(dir, "sample_analysis_expected.json"), "utf8"));
const e = gold.expected;

const segments: TranscriptSegment[] = text
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l, i) => {
    const m = /^([^:]{1,40}):\s*(.*)$/.exec(l);
    return { id: `s${String(i + 1).padStart(3, "0")}`, start_ms: null, end_ms: null, speaker: m ? m[1]! : null, text: m ? m[2]! : l };
  });
const transcript: Transcript = {
  text,
  segments,
  metadata: { language: "pt", duration_ms: null, has_speakers: true, has_timestamps: false, provider: "text", model: null },
};

describe.skipIf(!process.env.AI_TESTS)("pipeline completo (ao vivo)", () => {
  it("analyzeMeeting atende o gabarito", { timeout: 400_000 }, async () => {
    const steps: string[] = [];
    const a = await analyzeMeeting(transcript, "22222222-2222-4222-8222-222222222222", { onProgress: (s) => steps.push(s) });
    fs.mkdirSync(path.resolve(import.meta.dirname, "../../logs"), { recursive: true });
    fs.writeFileSync(path.resolve(import.meta.dirname, "../../logs/pipeline_live_last.json"), JSON.stringify(a, null, 2));

    expect(steps).toEqual(["extracting", "auditing", "summarizing"]);
    expect(MeetingAnalysis.safeParse(a).success).toBe(true);

    const norm = normalizeQuote;
    const lines = text.split(/\r?\n/).map((l) => norm(l));
    const has = (items: { source_refs: { quote: string }[] }[], anchor: string) => {
      const hit = lines.filter((l) => l.includes(norm(anchor)));
      return items.find((i) => i.source_refs.some((r) => { const q = norm(r.quote); return q.length > 0 && hit.some((l) => l.includes(q)); }));
    };
    const checks: [string, boolean][] = [
      ...e.decisions.map((d: { key: string; anchor: string }) => [d.key, !!has(a.decisions, d.anchor)] as [string, boolean]),
      ...e.commitments.map((c: { key: string; anchor: string }) => [c.key, !!has(a.commitments, c.anchor)] as [string, boolean]),
      ...e.requirements.map((r: { key: string; anchor: string }) => [r.key, !!has(a.requirements, r.anchor)] as [string, boolean]),
    ];
    const found = checks.filter(([, ok]) => ok).length / checks.length;
    console.info(`gabarito: ${(found * 100).toFixed(0)}%`, checks.filter(([, ok]) => !ok).map(([k]) => k));

    const refs = [...a.decisions, ...a.commitments, ...a.requirements, ...a.client_needs, ...a.open_issues].flatMap((i) => i.source_refs);
    const full = norm(text.replace(/\s+/g, " "));
    const literal = refs.filter((r) => full.includes(norm(r.quote))).length;
    console.info(`quotes literais pós-validação: ${literal}/${refs.length}`);
    console.info(`resumo: ${a.meeting_summary ? "ok" : "null"}; limitations: ${a.limitations.length}`);
    for (const r of refs.slice(0, 5)) console.info(`quote: "${r.quote}" -> ${r.segment_id}`);

    expect(found).toBeGreaterThanOrEqual(gold.thresholds.min_expected_items_found);
    expect(literal / refs.length).toBe(1);
    for (const c of e.commitments.filter((x: { must_not_be?: string }) => x.must_not_be)) {
      const item = has(a.commitments, c.anchor);
      if (item) expect((item as { status: string }).status).not.toBe(c.must_not_be);
    }
    expect(a.open_issues.some((i) => i.type === "contradiction")).toBe(true);
  });
});
