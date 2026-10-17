// Validações pós-schema da extração (docs/AI_PIPELINE.md §6.1). Funções puras: nada de I/O.
// Devolve a extração corrigida, os motivos para reprocessar (repair) e notas para `limitations[]`.
import type { ExtractionOutput, SourceRef } from "../../../../shared/src/schemas/analysis.js";
import type { Transcript } from "../transcription/types.js";

export interface ValidationResult {
  extraction: ExtractionOutput;
  reprocess: string[]; // violações que exigem nova tentativa (prompt repair)
  limitations: string[]; // alterações feitas pelo validador, para o revisor
}

export const MAX_SUMMARY_CHARS = 1200;
export const LONG_TRANSCRIPT_WORDS = 500;

// --- Normalização e localização de citações ---

function foldChars(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Normaliza para comparação: espaços, caixa e pontuação/aspas nas pontas. */
export function normalizeQuote(s: string): string {
  return foldChars(s)
    .replace(/^[\s"'.,;:!?\-]+/, "")
    .replace(/[\s"'.,;:!?\-]+$/, "");
}

interface Index {
  fullText: string; // transcrição normalizada (sem trim)
  segText: string; // segmentos normalizados, unidos por " "
  spans: { start: number; end: number; seg: Transcript["segments"][number] }[];
}

function buildIndex(t: Transcript): Index {
  const spans: Index["spans"] = [];
  let acc = "";
  for (const seg of t.segments) {
    const n = foldChars(seg.text).trim();
    if (acc) acc += " ";
    spans.push({ start: acc.length, end: acc.length + n.length, seg });
    acc += n;
  }
  return { fullText: foldChars(t.text), segText: acc, spans };
}

/** Procura a quote e devolve a SourceRef completa, ou null se não ocorre na transcrição. */
function locate(ref: SourceRef, idx: Index): SourceRef | null {
  const q = normalizeQuote(ref.quote);
  if (!q) return null;
  const at = idx.segText.indexOf(q);
  if (at >= 0) {
    const last = at + q.length - 1;
    const first = idx.spans.find((s) => at <= s.end && at >= s.start) ?? idx.spans.find((s) => s.start > at);
    const lastSpan = [...idx.spans].reverse().find((s) => s.start <= last) ?? first;
    if (first && lastSpan) {
      return {
        quote: ref.quote,
        segment_id: first.seg.id,
        speaker: first.seg.speaker,
        start_ms: first.seg.start_ms,
        end_ms: lastSpan.seg.end_ms,
      };
    }
  }
  if (idx.fullText.includes(q)) {
    return { quote: ref.quote, segment_id: null, speaker: null, start_ms: null, end_ms: null };
  }
  return null;
}

/**
 * Valida as quotes de uma lista de refs: remove as inexistentes e preenche segment_id/speaker/
 * start_ms/end_ms a partir da posição (valores do modelo são descartados).
 */
export function resolveSourceRefs(
  refs: SourceRef[],
  transcript: Transcript,
): { refs: SourceRef[]; invalid: SourceRef[] } {
  const idx = buildIndex(transcript);
  return resolveWithIndex(refs, idx);
}

function resolveWithIndex(refs: SourceRef[], idx: Index) {
  const ok: SourceRef[] = [];
  const invalid: SourceRef[] = [];
  for (const r of refs) {
    const found = locate(r, idx);
    if (found) ok.push(found);
    else invalid.push(r);
  }
  return { refs: ok, invalid };
}

// --- Regra 1: citações existem (rebaixa, não reprocessa) ---

type RefItem = { id: string; confidence: "high" | "medium" | "low"; source_refs: SourceRef[] };

function checkQuotes(ex: ExtractionOutput, transcript: Transcript, limitations: string[]) {
  const idx = buildIndex(transcript);
  const lists: { label: string; items: RefItem[] }[] = [
    { label: "necessidade", items: ex.client_needs },
    { label: "requisito", items: ex.requirements },
    { label: "decisão", items: ex.decisions },
    { label: "compromisso", items: ex.commitments },
    { label: "sugestão", items: ex.tech_suggestions },
  ];
  for (const { label, items } of lists) {
    for (const item of items) {
      const { refs, invalid } = resolveWithIndex(item.source_refs, idx);
      item.source_refs = refs;
      if (invalid.length > 0) {
        item.confidence = "low";
        limitations.push(
          `${label} ${item.id}: ${invalid.length} citação(ões) não encontrada(s) na transcrição foram removidas.`,
        );
      } else if (refs.length === 0) {
        item.confidence = "low";
        limitations.push(`${label} ${item.id}: sem citação da transcrição; confiança baixa.`);
      }
      if (refs.length === 0) {
        const dec = item as unknown as ExtractionOutput["decisions"][number];
        const com = item as unknown as ExtractionOutput["commitments"][number];
        if (label === "decisão" && dec.status === "confirmed") {
          dec.status = "pending_validation";
          limitations.push(`decisão ${item.id} rebaixada para pending_validation: sem citação válida.`);
        }
        if (label === "compromisso" && com.status === "confirmed") {
          com.status = "tentative";
          limitations.push(`compromisso ${item.id} rebaixado para tentative: sem citação válida.`);
        }
      }
    }
  }
}

// --- Regra 2: ids únicos e referências (reprocessa) ---

function checkIds(ex: ExtractionOutput, reprocess: string[]) {
  const seen = new Set<string>();
  const dup = new Set<string>();
  const all = [
    ...ex.client_needs,
    ...ex.requirements,
    ...ex.modules,
    ...ex.decisions,
    ...ex.commitments,
    ...ex.tech_suggestions,
  ];
  for (const it of all) {
    if (seen.has(it.id)) dup.add(it.id);
    seen.add(it.id);
  }
  if (dup.size > 0) reprocess.push(`IDs duplicados: ${[...dup].join(", ")}. Cada id deve ser único.`);

  const moduleIds = new Set(ex.modules.map((m) => m.id));
  const reqIds = new Set(ex.requirements.map((r) => r.id));
  for (const r of ex.requirements) {
    if (r.module_id != null && !moduleIds.has(r.module_id)) {
      reprocess.push(`Requisito ${r.id} referencia module_id inexistente "${r.module_id}".`);
    }
    for (const d of r.depends_on) {
      if (!reqIds.has(d)) reprocess.push(`Requisito ${r.id} depende de "${d}", que não é um requisito existente.`);
    }
  }
  for (const m of ex.modules) {
    for (const rid of m.requirement_ids) {
      if (!reqIds.has(rid)) reprocess.push(`Módulo ${m.id} lista requirement_ids inexistente "${rid}".`);
    }
  }
}

// --- Regras 3 e 4: rebaixamentos (sem reprocessar) ---

function applyDowngrades(ex: ExtractionOutput, limitations: string[]) {
  for (const d of ex.decisions) {
    if (d.status === "confirmed" && d.confidence === "low") {
      d.status = "pending_validation";
      limitations.push(`decisão ${d.id} rebaixada para pending_validation: confiança baixa.`);
    }
  }
  for (const c of ex.commitments) {
    const noOwner = c.owner.trim() === "" || normalizeQuote(c.owner) === "não identificado";
    if (c.status === "confirmed" && noOwner) {
      c.status = "tentative";
      limitations.push(`compromisso ${c.id} rebaixado para tentative: responsável não identificado.`);
    }
  }
}

// --- Regras 5 e 6: summary e cobertura (reprocessa) ---

function checkSummaryAndCoverage(ex: ExtractionOutput, transcript: Transcript, reprocess: string[]) {
  const len = ex.summary.trim().length;
  if (len === 0) reprocess.push("summary vazio.");
  else if (len > MAX_SUMMARY_CHARS) reprocess.push(`summary com ${len} caracteres; o máximo é ${MAX_SUMMARY_CHARS}.`);

  const words = transcript.text.split(/\s+/).filter(Boolean).length;
  if (ex.requirements.length === 0 && words > LONG_TRANSCRIPT_WORDS) {
    reprocess.push(
      "Nenhum requisito extraído, mas a transcrição contém discussão de funcionalidades. Extraia os requisitos descritos.",
    );
  }
}

export function validateExtraction(input: ExtractionOutput, transcript: Transcript): ValidationResult {
  const extraction = structuredClone(input);
  const limitations: string[] = [];
  const reprocess: string[] = [];

  checkQuotes(extraction, transcript, limitations);
  checkIds(extraction, reprocess);
  applyDowngrades(extraction, limitations);
  checkSummaryAndCoverage(extraction, transcript, reprocess);

  return { extraction, reprocess, limitations };
}
