// Validações do resumo da reunião (docs/AI_PIPELINE.md §6.2). Funções puras, sem rede.
// A normalização de quotes é própria deste módulo (mesma regra do §6.1: espaços, caixa e
// pontuação final) para não depender de validators.ts.
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
} as const;

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

export function quoteInTranscript(quote: string, transcriptText: string): boolean {
  const q = normalizeQuote(quote);
  if (!q) return false;
  return normalizeQuote(transcriptText).includes(q);
}

/** Preenche segment_id/speaker/start_ms/end_ms a partir dos segmentos; sem segmentos, tudo null. */
export function locateRef(ref: SourceRef, transcript: Transcript): SourceRef {
  const base: SourceRef = { quote: ref.quote, segment_id: null, speaker: null, start_ms: null, end_ms: null };
  const q = normalizeQuote(ref.quote);
  if (!q) return base;
  const seg = transcript.segments.find((s) => normalizeQuote(s.text).includes(q));
  if (!seg) return base;
  return { ...base, segment_id: seg.id, speaker: seg.speaker, start_ms: seg.start_ms, end_ms: seg.end_ms };
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

/** Sequência de dígitos fora de palavras: "B2B" e "MP3" não contam como número. */
const STANDALONE_NUMBER = /(?<![\p{L}\d])\d+(?![\p{L}])/gu;
const ID_PATTERN = /\b[a-z]+_\d+\b/gi;

function digitTokens(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? []);
}

/** Textos do resumo em que números são conferidos (ids ficam de fora). */
function summaryTexts(s: MeetingSummaryOutput): string[] {
  return [s.headline, s.executive_summary, ...s.topics.flatMap((t) => [t.title, t.summary])];
}

/** Números do resumo que não aparecem na transcrição nem nos itens da análise. */
export function numbersNotFound(summary: MeetingSummaryOutput, transcriptText: string, analysis: SummaryAnalysis): string[] {
  const analysisText = JSON.stringify(analysis).replace(ID_PATTERN, " ");
  const known = new Set([...digitTokens(transcriptText), ...digitTokens(analysisText)]);
  const missing = new Set<string>();
  for (const text of summaryTexts(summary)) {
    for (const n of text.match(STANDALONE_NUMBER) ?? []) if (!known.has(n)) missing.add(n);
  }
  return [...missing];
}

// ---------------------------------------------------------------------------
// validateSummary
// ---------------------------------------------------------------------------

const isEligible = (status: string) => status === "confirmed" || status === "edited";

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
    const valid = t.source_refs.filter((r) => quoteInTranscript(r.quote, transcript.text)).map((r) => locateRef(r, transcript));
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
  const nums = numbersNotFound(s, transcript.text, analysis);
  if (nums.length) violations.push(`números no texto que não aparecem na transcrição nem na análise: ${nums.join(", ")}. Remova-os ou escreva por extenso`);

  return { summary: s, limitations, violations, ok: violations.length === 0 };
}
