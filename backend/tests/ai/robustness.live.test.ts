// Robustez do pipeline completo em transcrição de ÁUDIO (sem rótulos de falante), N execuções reais.
// Roda só com AI_TESTS=1 (gasta chamadas reais). Critério por CONTEÚDO, não por âncora (ver gabarito).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeMeeting } from "../../src/services/aiAnalysis/pipeline.js";
import { fromText } from "../../src/services/transcription/service.js";

const root = path.resolve(import.meta.dirname, "../../..");
const gold = JSON.parse(fs.readFileSync(path.join(root, "sample_data/sample_analysis_expected.json"), "utf8")).audio_no_speakers;
const raw = JSON.parse(fs.readFileSync(path.join(root, gold.transcript_source), "utf8"));
const RUNS = Number(process.env.AI_RUNS ?? gold.thresholds.runs);

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
// O padrão é uma regex: só remove acentos (o texto já vem normalizado), sem tocar em | [] etc.
export const rx = (p: string) => new RegExp(p.normalize("NFD").replace(/\p{Diacritic}/gu, ""), "i");

type Item = { description?: string; title?: string; source_refs?: { quote: string }[]; [k: string]: any };
const text = (x: Item) => norm([x.description, x.title, ...(x.source_refs ?? []).map((r) => r.quote)].filter(Boolean).join(" "));
const allOf = (x: Item, pats: string[]) => pats.every((p) => rx(p).test(text(x)));
const anyOf = (x: Item, pats: string[]) => pats.some((p) => rx(p).test(text(x)));

async function runOnce(i: number) {
  const transcript = fromText(raw.text);
  const a: any = await analyzeMeeting(transcript, `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`);
  const T = norm(transcript.text);
  const found: Record<string, boolean> = {};

  for (const g of gold.decisions_confirmed) found[g.key] = a.decisions.some((x: Item) => x.status === "confirmed" && allOf(x, g.all_of));
  for (const g of gold.decisions_pending) found[g.key] = a.decisions.some((x: Item) => x.status === "pending_validation" && allOf(x, g.all_of));
  for (const g of gold.commitments) {
    found[g.key] = a.commitments.some((x: Item) => {
      if (!allOf(x, g.all_of)) return false;
      if (g.owner_contains && !String(x.owner).includes(g.owner_contains)) return false;
      if (g.owner_must_be && x.owner !== g.owner_must_be) return false;
      if (g.must_not_be && x.status === g.must_not_be) return false;
      return g.status ? x.status === g.status : true;
    });
  }
  for (const g of gold.requirements) found[g.key] = a.requirements.some((x: Item) => allOf(x, g.all_of));
  for (const g of gold.open_issues)
    found[g.key] = a.open_issues.some((x: Item) => (g.type ? x.type === g.type : anyOf(x, g.any_of)));

  const quotes: string[] = [...a.decisions, ...a.commitments, ...a.requirements, ...a.client_needs, ...a.open_issues, ...a.tech_suggestions].flatMap(
    (x: Item) => (x.source_refs ?? []).map((r) => r.quote),
  );
  const fidelity = quotes.filter((q) => T.includes(norm(q))).length / Math.max(1, quotes.length);
  const forbidden = [...a.decisions, ...a.requirements, ...a.commitments].some((x: Item) => gold.forbidden_as_decision.some((p: string) => rx(p).test(text(x))));

  // Violação != ausência: ausência só entra na taxa; violação quebra o teste em qualquer execução.
  const violations = {
    carlosConfirmed: a.commitments
      .filter((x: Item) => allOf(x, ["\bapi\b"]) && String(x.owner).includes("Carlos") && x.status === "confirmed")
      .map((x: Item) => `${x.description} | ${(x.source_refs ?? []).map((r) => r.quote).join(" / ")}`),
    propostaDonoInventado: a.commitments.some(
      (x: Item) => allOf(x, ["proposta", "semana"]) && (x.status === "confirmed" || x.owner !== "não identificado"),
    ),
  };
  const s = a.meeting_summary;
  const status = new Map<string, string>(a.decisions.map((d: any) => [d.id, d.status]));
  const issueType = new Map<string, string>(a.open_issues.map((d: any) => [d.id, d.type]));
  const summaryOk = {
    exists: !!s,
    openLe5: !!s && s.open_points.length <= 5,
    keyOnlyConfirmed: !!s && s.key_decisions.every((id: string) => status.get(id) === "confirmed"),
    pendOnlyPending: !!s && s.pending_decisions.every((id: string) => status.get(id) === "pending_validation"),
    contradictionListed: !!s && s.open_points.some((id: string) => issueType.get(id) === "contradiction"),
  };
  return { found, fidelity, forbidden, summaryOk, violations };
}

describe.skipIf(!process.env.AI_TESTS)("robustez em áudio sem falantes (execuções reais)", () => {
  it(`invariantes em todas as ${RUNS} execuções e taxa de itens do gabarito`, async () => {
    const runs = await Promise.all(Array.from({ length: RUNS }, (_, i) => runOnce(i + 1)));
    const keys = Object.keys(runs[0]!.found);

    const rate = (k: string) => runs.filter((r) => r.found[k]).length / runs.length;
    const table = keys.map((k) => `${k.padEnd(28)} ${runs.filter((r) => r.found[k]).length}/${runs.length}`).join("\n");
    console.log(`\nTaxa por item do gabarito (${RUNS} execuções):\n${table}`);

    // Invariantes: valem em TODAS as execuções (são os princípios do produto).
    for (const r of runs) {
      expect(r.forbidden, "sugestão do fornecedor virou decisão/requisito/compromisso").toBe(false);
      expect(r.fidelity, "citações literais").toBeGreaterThanOrEqual(0.9);
      expect(r.summaryOk, "resumo coerente com a análise").toEqual({
        exists: true, openLe5: true, keyOnlyConfirmed: true, pendOnlyPending: true, contradictionListed: true,
      });
    }
    for (const r of runs) {
      expect(r.violations.carlosConfirmed, "compromisso condicional do Carlos virou confirmed").toEqual([]);
      expect(r.violations.propostaDonoInventado, "compromisso da proposta com dono inventado ou confirmed").toBe(false);
    }

    // Qualidade média (não é invariante: o modelo oscila).
    const avg = keys.reduce((n, k) => n + rate(k), 0) / keys.length;
    console.log(`Taxa média: ${(avg * 100).toFixed(0)}%`);
    expect(avg).toBeGreaterThanOrEqual(gold.thresholds.min_items_found_rate);
  }, 600_000);
});
