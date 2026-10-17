// Validações do resumo da reunião (docs/AI_PIPELINE.md §6.2). Funções puras, sem rede.
// A normalização de quotes é própria deste módulo (mesma regra do §6.1: espaços, caixa e
// pontuação final); a busca em segmentos unidos espelha a de validators.ts, com fronteira de palavra.
import type {
  ExtractionOutput,
  MeetingSummaryOutput,
  GapAuditOutput,
  SourceRef,
} from "../../../../shared/src/schemas/analysis.js";
import type { Transcript } from "../transcription/types.js";

/** Subconjunto da análise validada (MeetingAnalysis serve) de que o resumo precisa. */
export type SummaryAnalysis = Pick<
  ExtractionOutput,
  "summary" | "decisions" | "commitments" | "requirements" | "client_needs" | "tech_suggestions"
> & { open_issues: GapAuditOutput["open_issues"] };

export type SummaryBasis = "analysis" | "reviewed";

export const SUMMARY_LIMITS = {
  headline: 140,
  executive_summary: 700,
  topic_title: 80,
  topic_summary: 400,
  min_topics: 3,
  max_topics: 8,
  max_open_points: 5,
} as const;

const HIGH_IMPACT = new Set(["effort", "architecture", "timeline"]);

/** Prioridade de uma pendência para o resumo: contradição > impacto em esforço/arquitetura/prazo > custo/escopo. */
export function openIssuePriority(i: { type: string; impact: string[]; confidence: string }): number {
  return (
    (i.type === "contradiction" ? 100 : 0) +
    10 * i.impact.filter((x) => HIGH_IMPACT.has(x)).length +
    3 * i.impact.filter((x) => !HIGH_IMPACT.has(x)).length +
    (i.confidence === "high" ? 1 : 0)
  );
}

export interface SummaryValidation {
  /** Resumo com as correções automáticas aplicadas (listas, quotes, referências preenchidas). */
  summary: MeetingSummaryOutput;
  /** Alterações automáticas feitas; vão para `limitations[]` da análise. */
  limitations: string[];
  /** Violações que exigem reprocessar (repair). Vazio = resumo aceitável. */
  violations: string[];
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Normalização e localização de quotes
// ---------------------------------------------------------------------------

/** Minúsculas, aspas tipográficas simplificadas, espaços colapsados, sem pontuação nas pontas. */
export function normalizeQuote(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[\s.,;:!?"'()\-–—…]+/, "")
    .replace(/[\s.,;:!?"'()\-–—…]+$/, "");
}

/** Quote curta demais prova pouco: exige >= 12 caracteres ou >= 3 palavras (após normalizar). */
export const MIN_QUOTE_CHARS = 12;
export const MIN_QUOTE_WORDS = 3;

const isLongEnough = (q: string) => q.length >= MIN_QUOTE_CHARS || q.split(" ").filter(Boolean).length >= MIN_QUOTE_WORDS;
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\d]/u.test(c);

/** Normaliza sem tirar pontuação das pontas (usado nos segmentos, que são unidos antes da busca). */
function fold(s: string): string {
  return normalizeQuote(`|${s}|`).slice(1, -1).trim();
}

/** Posição da 1ª ocorrência de `needle` em `hay` que começa e termina em fronteira de palavra; -1 se não há. */
function indexAtBoundary(hay: string, needle: string): number {
  if (!needle) return -1;
  for (let from = 0; ; ) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return -1;
    const startOk = !isWordChar(needle[0]) || !isWordChar(hay[i - 1]);
    const endOk = !isWordChar(needle[needle.length - 1]) || !isWordChar(hay[i + needle.length]);
    if (startOk && endOk) return i;
    from = i + 1;
  }
}

/** Segmentos normalizados unidos por " ", com o intervalo de cada um (permite quote que atravessa segmentos). */
function segmentIndex(transcript: Pick<Transcript, "segments">) {
  const spans: { start: number; end: number; seg: Transcript["segments"][number] }[] = [];
  let acc = "";
  for (const seg of transcript.segments) {
    const n = fold(seg.text);
    if (acc) acc += " ";
    spans.push({ start: acc.length, end: acc.length + n.length, seg });
    acc += n;
  }
  return { text: acc, spans };
}

/**
 * A quote ocorre na transcrição (texto inteiro ou segmentos unidos), em fronteira de palavra e com
 * tamanho mínimo (12 caracteres ou 3 palavras).
 */
export function quoteInTranscript(quote: string, transcriptText: string, segments: Transcript["segments"] = []): boolean {
  const q = normalizeQuote(quote);
  if (!q || !isLongEnough(q)) return false;
  if (indexAtBoundary(fold(transcriptText), q) >= 0) return true;
  return segments.length > 0 && indexAtBoundary(segmentIndex({ segments }).text, q) >= 0;
}

/**
 * Preenche segment_id/speaker/start_ms/end_ms a partir dos segmentos; sem segmentos, tudo null.
 * Quote que atravessa segmentos fica no primeiro (start_ms do 1º, end_ms do último), como em validators.ts.
 */
export function locateRef(ref: SourceRef, transcript: Transcript): SourceRef {
  const base: SourceRef = { quote: ref.quote, segment_id: null, speaker: null, start_ms: null, end_ms: null };
  const q = normalizeQuote(ref.quote);
  if (!q) return base;
  const idx = segmentIndex(transcript);
  const at = indexAtBoundary(idx.text, q);
  if (at < 0) return base;
  const last = at + q.length - 1;
  const first = idx.spans.find((s) => at >= s.start && at <= s.end) ?? idx.spans.find((s) => s.start > at);
  const lastSpan = [...idx.spans].reverse().find((s) => s.start <= last) ?? first;
  if (!first || !lastSpan) return base;
  return { ...base, segment_id: first.seg.id, speaker: first.seg.speaker, start_ms: first.seg.start_ms, end_ms: lastSpan.seg.end_ms };
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

const isEligible = (status: string) => status === "confirmed" || status === "edited";

/** Com basis=reviewed, só itens confirmed/edited; com basis=analysis, todos. */
export function itemsForBasis<T extends { review_status: string }>(xs: T[], basis: SummaryBasis): T[] {
  return basis === "reviewed" ? xs.filter((x) => isEligible(x.review_status)) : xs;
}

/**
 * Número isolado (milhar "20.000" e decimal "12,5" são um token só). "B2B"/"MP3" não contam; "10h",
 * "30min", "500mb" contam como 10, 30 e 500 (unidade colada conhecida), nunca como "1", "3", "50".
 */
const NUMBER_TOKEN =
  /(?<![\p{L}\d])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?!\d)(?=(?:h|hs|min|mb|gb|kb|tb|ms|k|x|s|m)(?![\p{L}\d])|(?![\p{L}]))/giu;
const ID_PATTERN = /\b[a-z]+_\d+\b/gi;

/** Forma canônica: sem separador de milhar, decimal com ponto, sem ".0" final ("20.000" -> "20000"). */
function canon(raw: string): string {
  const n = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(",", ".");
  return n.replace(/\.0+$/, "");
}

function numberTokens(text: string): string[] {
  return [...text.matchAll(NUMBER_TOKEN)].map((m) => canon(m[1]!));
}

/** Números conhecidos: tokens canônicos; decimais também liberam parte inteira e fracionária. */
function digitTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of numberTokens(text)) {
    out.add(t);
    if (t.includes(".")) for (const p of t.split(".")) out.add(p);
  }
  for (const m of text.matchAll(/(?<=\p{L})\d+|\d+(?=\p{L})/gu)) out.add(m[0]); // "B2B", "MP3", "10h"
  return out;
}

/** Textos do resumo em que números são conferidos (ids ficam de fora). */
function summaryTexts(s: MeetingSummaryOutput): string[] {
  return [s.headline, s.executive_summary, ...s.topics.flatMap((t) => [t.title, t.summary])];
}

/** Visão da análise usada como evidência de números: com basis=reviewed, só itens revisados (sem o resumo bruto). */
function evidenceAnalysis(analysis: SummaryAnalysis, basis: SummaryBasis) {
  if (basis === "analysis") return analysis;
  return {
    decisions: itemsForBasis(analysis.decisions, basis),
    commitments: itemsForBasis(analysis.commitments, basis),
    requirements: itemsForBasis(analysis.requirements, basis),
    client_needs: itemsForBasis(analysis.client_needs, basis),
    tech_suggestions: itemsForBasis(analysis.tech_suggestions, basis),
    open_issues: itemsForBasis(analysis.open_issues, basis),
  };
}

/** Números do resumo que não aparecem na transcrição nem nos itens da análise (revisados, se basis=reviewed). */
export function numbersNotFound(
  summary: MeetingSummaryOutput,
  transcriptText: string,
  analysis: SummaryAnalysis,
  basis: SummaryBasis = "analysis",
): string[] {
  const analysisText = JSON.stringify(evidenceAnalysis(analysis, basis)).replace(ID_PATTERN, " ");
  const known = new Set([...digitTokens(transcriptText), ...digitTokens(analysisText)]);
  const missing = new Set<string>();
  for (const text of summaryTexts(summary)) {
    for (const m of text.matchAll(NUMBER_TOKEN)) if (!known.has(canon(m[1]!))) missing.add(m[1]!);
  }
  return [...missing];
}

// ---------------------------------------------------------------------------
// validateSummary
// ---------------------------------------------------------------------------

export function validateSummary(
  input: MeetingSummaryOutput,
  ctx: { transcript: Transcript; analysis: SummaryAnalysis; basis: SummaryBasis },
): SummaryValidation {
  const { transcript, analysis, basis } = ctx;
  const violations: string[] = [];
  const limitations: string[] = [];
  const s: MeetingSummaryOutput = structuredClone(input);

  const decisions = new Map(analysis.decisions.map((d) => [d.id, d]));
  const commitments = new Map(analysis.commitments.map((c) => [c.id, c]));
  const issues = new Map(analysis.open_issues.map((i) => [i.id, i]));

  // 1. Ids existem, no tipo certo (dec_*, com_*, iss_*) -> repair.
  const checkIds = (field: keyof Pick<MeetingSummaryOutput, "key_decisions" | "pending_decisions" | "next_steps" | "open_points">,
    prefix: string, known: Map<string, unknown>) => {
    const bad = s[field].filter((id) => !id.startsWith(prefix) || !known.has(id));
    if (bad.length) violations.push(`${field} contém ids inexistentes ou de tipo errado (esperado ${prefix}*): ${bad.join(", ")}`);
  };
  checkIds("key_decisions", "dec_", decisions);
  checkIds("pending_decisions", "dec_", decisions);
  checkIds("next_steps", "com_", commitments);
  checkIds("open_points", "iss_", issues);

  const dedupe = (ids: string[]) => [...new Set(ids)];

  // 2. basis=reviewed: remove ids de itens rejected/pending.
  if (basis === "reviewed") {
    const strip = (field: "key_decisions" | "pending_decisions" | "next_steps" | "open_points", known: Map<string, { review_status: string }>) => {
      const removed = s[field].filter((id) => known.get(id) && !isEligible(known.get(id)!.review_status));
      if (removed.length) {
        s[field] = s[field].filter((id) => !removed.includes(id));
        limitations.push(`Resumo: ids removidos de ${field} por não estarem confirmados/editados na revisão: ${removed.join(", ")}.`);
      }
    };
    strip("key_decisions", decisions);
    strip("pending_decisions", decisions);
    strip("next_steps", commitments);
    strip("open_points", issues);
  }

  // 3. key_decisions só confirmed; pending_decisions só pending_validation (move, sem repair);
  //    nada omitido (completa a partir da análise).
  const eligibleDecisions = analysis.decisions.filter((d) => basis === "analysis" || isEligible(d.review_status));
  const statusOf = (id: string) => decisions.get(id)?.status;
  const moved: string[] = [];
  const keyIn = s.key_decisions.filter((id) => statusOf(id) !== "pending_validation");
  const pendIn = s.pending_decisions.filter((id) => statusOf(id) !== "confirmed");
  for (const id of s.key_decisions) if (statusOf(id) === "pending_validation") moved.push(`${id} (-> pending_decisions)`);
  for (const id of s.pending_decisions) if (statusOf(id) === "confirmed") moved.push(`${id} (-> key_decisions)`);
  const toKey = s.pending_decisions.filter((id) => statusOf(id) === "confirmed");
  const toPend = s.key_decisions.filter((id) => statusOf(id) === "pending_validation");
  s.key_decisions = dedupe([...keyIn, ...toKey]);
  s.pending_decisions = dedupe([...pendIn, ...toPend]);
  if (moved.length) limitations.push(`Resumo: decisões movidas para a lista correta conforme o status da análise: ${moved.join(", ")}.`);

  const addedMissing: string[] = [];
  for (const d of eligibleDecisions) {
    const list = d.status === "confirmed" ? s.key_decisions : s.pending_decisions;
    if (!list.includes(d.id)) {
      list.push(d.id);
      addedMissing.push(d.id);
    }
  }
  if (addedMissing.length) limitations.push(`Resumo: decisões omitidas completadas a partir da análise: ${addedMissing.join(", ")}.`);

  s.next_steps = dedupe(s.next_steps);
  s.open_points = dedupe(s.open_points);

  // 3b. No máximo `max_open_points` pontos em aberto, os mais prioritários (corte determinístico, sem repair;
  //     a ordem original do modelo desempata). As demais pendências continuam na análise.
  if (s.open_points.length > SUMMARY_LIMITS.max_open_points) {
    const rank = (id: string) => (issues.has(id) ? openIssuePriority(issues.get(id)!) : -1);
    const ordered = s.open_points
      .map((id, idx) => ({ id, idx, p: rank(id) }))
      .sort((a, b) => b.p - a.p || a.idx - b.idx)
      .slice(0, SUMMARY_LIMITS.max_open_points)
      .sort((a, b) => a.idx - b.idx);
    const cut = s.open_points.length - ordered.length;
    s.open_points = ordered.map((o) => o.id);
    limitations.push(`Resumo: ${cut} pendência(s) de menor prioridade ficam só na análise (limite de ${SUMMARY_LIMITS.max_open_points} pontos em aberto no resumo).`);
  }

  // 4. Limites de tamanho e de quantidade -> repair.
  if (!s.headline.trim() || s.headline.length > SUMMARY_LIMITS.headline)
    violations.push(`headline deve ter de 1 a ${SUMMARY_LIMITS.headline} caracteres (tem ${s.headline.length})`);
  if (!s.executive_summary.trim() || s.executive_summary.length > SUMMARY_LIMITS.executive_summary)
    violations.push(`executive_summary deve ter de 1 a ${SUMMARY_LIMITS.executive_summary} caracteres (tem ${s.executive_summary.length})`);
  s.topics.forEach((t, i) => {
    if (t.title.length > SUMMARY_LIMITS.topic_title) violations.push(`topics[${i}].title excede ${SUMMARY_LIMITS.topic_title} caracteres`);
    if (t.summary.length > SUMMARY_LIMITS.topic_summary) violations.push(`topics[${i}].summary excede ${SUMMARY_LIMITS.topic_summary} caracteres`);
    if (t.source_refs.length < 1) violations.push(`topics[${i}] ("${t.title}") não tem source_refs`);
  });

  // 5. Quotes dos tópicos: remove a inválida; tópico sem ref válida é descartado.
  const dropped: string[] = [];
  const kept = [];
  for (const t of s.topics) {
    const valid = t.source_refs.filter((r) => quoteInTranscript(r.quote, transcript.text, transcript.segments)).map((r) => locateRef(r, transcript));
    const removed = t.source_refs.length - valid.length;
    if (removed > 0) limitations.push(`Resumo: ${removed} citação(ões) do tópico "${t.title}" não encontrada(s) na transcrição e removida(s).`);
    if (valid.length === 0) {
      if (t.source_refs.length > 0) dropped.push(t.title);
      continue; // sem refs (já violação) ou todas inválidas
    }
    kept.push({ ...t, source_refs: valid });
  }
  if (dropped.length) limitations.push(`Resumo: tópicos descartados por não terem citação válida: ${dropped.join("; ")}.`);
  s.topics = kept;
  if (s.topics.length < SUMMARY_LIMITS.min_topics || s.topics.length > SUMMARY_LIMITS.max_topics)
    violations.push(`topics deve ter de ${SUMMARY_LIMITS.min_topics} a ${SUMMARY_LIMITS.max_topics} itens com citação literal válida (restaram ${s.topics.length})`);

  // 6. Números inventados -> repair com a lista.
  const nums = numbersNotFound(s, transcript.text, analysis, basis);
  if (nums.length) violations.push(`números no texto que não aparecem na transcrição nem na análise: ${nums.join(", ")}. Remova-os ou escreva por extenso`);

  return { summary: s, limitations, violations, ok: violations.length === 0 };
}
