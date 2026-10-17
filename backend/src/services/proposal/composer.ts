// Composição textual da proposta (etapa 9, LLM #3; docs/AI_PIPELINE.md §2, §5, §9).
// A IA redige, não estima: os números vêm do motor determinístico e `assertNumbersUnchanged`
// rejeita texto que cite horas/semanas/valores fora das estimativas.
import { structuredCompletion } from "../../integrations/openai/client.js";
import { AiOutputInvalidError } from "../../core/errors.js";
import { loadPrompt } from "../aiAnalysis/prompts/loader.js";
import { z } from "zod";

import { ProposalTextOutput } from "../../../../shared/src/schemas/proposal.js";
export { ProposalTextOutput };

// Tipos estruturais mínimos do que o composer lê de MeetingAnalysis / EstimateResult (shared).
interface ReviewedItem {
  id: string;
  review_status: string;
  source_refs: unknown;
  reviewer_note: unknown;
}
export interface ComposerAnalysis {
  summary: string;
  participants: unknown[];
  client_needs: ReviewedItem[];
  requirements: (ReviewedItem & { depends_on: string[] })[];
  modules: { id: string; name: string; description: string; requirement_ids: string[]; complexity: string }[];
  decisions: ReviewedItem[];
  commitments: ReviewedItem[];
  open_issues: (ReviewedItem & { related_ids?: unknown })[];
  tech_suggestions: ReviewedItem[];
  limitations: string[];
  [key: string]: unknown;
}
type MeetingAnalysis = ComposerAnalysis;

/** Estimativas já calculadas (somente leitura para o LLM). */
export interface ComposerEstimates {
  estimates: {
    method: string;
    basis_label: string;
    lines: { module_id: string; profile: string; hours_min: number; hours_max: number; rationale: string | null }[];
    totals_by_profile: Record<string, { hours_min: number; hours_max: number }>;
    total_hours_min: number;
    total_hours_max: number;
    confidence: "high" | "medium" | "low";
    assumptions: string[];
  };
  team?: unknown[];
  schedule?: unknown[];
  total_weeks?: number;
  commercial?: unknown;
}

export interface VendorProfileInput {
  company: string;
  contact_name?: string | null;
  contact_email?: string | null;
  website?: string | null;
  is_demo_profile?: boolean;
  [key: string]: unknown;
}

const isReviewed = (i: { review_status: string }) => i.review_status === "confirmed" || i.review_status === "edited";

/** Mantém só itens confirmed/edited; módulos sem requisito revisado saem; ids órfãos são removidos. */
export function filterReviewed(a: MeetingAnalysis): MeetingAnalysis {
  const requirements = a.requirements.filter(isReviewed);
  const reqIds = new Set(requirements.map((r) => r.id));
  const modules = a.modules
    .map((m) => ({ ...m, requirement_ids: m.requirement_ids.filter((id) => reqIds.has(id)) }))
    .filter((m) => m.requirement_ids.length > 0);
  const decisions = a.decisions.filter(isReviewed);
  const commitments = a.commitments.filter(isReviewed);
  const needs = a.client_needs.filter(isReviewed);
  const suggestions = a.tech_suggestions.filter(isReviewed);
  const alive = new Set<string>([
    ...reqIds,
    ...modules.map((m) => m.id),
    ...[...decisions, ...commitments, ...needs, ...suggestions].map((i) => i.id),
  ]);
  const open_issues = a.open_issues.filter(isReviewed).map((i) => ({
    ...i,
    // não vaza ids de itens descartados na revisão
    related_ids: Array.isArray(i.related_ids) ? (i.related_ids as string[]).filter((id) => alive.has(id)) : i.related_ids,
  }));
  return {
    ...a,
    client_needs: needs,
    requirements: requirements.map((r) => ({ ...r, depends_on: r.depends_on.filter((id) => reqIds.has(id)) })),
    modules,
    decisions,
    commitments,
    open_issues,
    tech_suggestions: suggestions,
  };
}

// --- Validador puro de números ---
//
// Cobre: horas (h/hs/hr/hrs/horas), semanas, dias, meses e dinheiro (R$, US$, "reais", "dólares",
// com sufixo k/mil/mi/milhões). Faixas de horas ("332 a 667 h") precisam ser um par existente nas
// estimativas (total, por perfil ou por linha), não apenas dois números conhecidos.
//
// NÃO cobre (limitações conhecidas):
// - números por extenso ("cinquenta horas", "três meses") e algarismos romanos;
// - horas citadas isoladas não são ligadas ao módulo/perfil: basta existir em qualquer lugar de `estimates`;
// - dias/meses só são conferidos contra `total_weeks`/`duration_weeks` convertidos (7 ou 5 dias/semana,
//   4 ou 4,345 semanas/mês); prazos que o motor não calcula serão rejeitados;
// - valores sem unidade nem moeda ("50 usuários", "2 s") são livres, assim como "R$" sem número;
// - números com contexto de SLA/suporte/reunião/garantia/pagamento (heurística por palavra-chave
//   na mesma oração) são tratados como não-esforço e ignorados, o que também deixa passar um
//   número de esforço escrito nesse contexto;
// - a moeda não é distinguida (US$ e R$ comparam com os mesmos totais).

const UNITS = String.raw`h|hs|hr|hrs|horas?|hours?|semanas?|weeks?|dias?|days?|m[eê]s(?:es)?|months?|reais|real|d[óo]lares?|usd|brl`;
const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?`;
const NUM_RE = new RegExp(String.raw`(?<![\p{L}\d])((?:R\$|US\$)\s*)?(${NUM})`, "giu");
const MULT_AFTER = /^\s?(k|mil|milh[ãõ]es?|mi)\b/i;
const UNIT_AFTER = new RegExp(String.raw`^\s*(${UNITS})\b`, "i");
const RANGE_AFTER = new RegExp(String.raw`^\s*(?:–|—|-|a|até|e)\s*(${NUM})`, "i");
const LABEL_BEFORE = /(?:fase|etapa|sprint|m[óo]dulo|passo|item|itera[çc][ãa]o|ciclo|marco|parte|entrega|release|milestone)\s*$/i;
const NON_EFFORT =
  /disponibilidade|resposta|respond|\bsla\b|suporte|atendimento|reuni|workshop|sess(?:ão|ões|ao|oes)|treinamento|plant[aã]o|validade|garantia|backup|reten[cç][aã]o|uptime|janela|vencimento|pagamento|aceite|a cada|\bcada\b|por dia|por semana|por m[eê]s|24x7|24\/7/i;
const EFFORT_CUE = /estim|esfor[çc]o|total de|somam|desenvolvimento|implementa|constru[çc][ãa]o/i;

type Kind = "hours" | "weeks" | "days" | "months" | "money";

function parseNum(s: string): number {
  return /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(",", "."));
}

function multiplier(w: string | undefined): number {
  if (!w) return 1;
  const l = w.toLowerCase();
  return l === "k" || l === "mil" ? 1000 : 1_000_000;
}

function kindOfUnit(u: string): Kind {
  const l = u.toLowerCase();
  if (/^(?:h|hs|hr|hrs|horas?|hours?)$/.test(l)) return "hours";
  if (/^(?:semanas?|weeks?)$/.test(l)) return "weeks";
  if (/^(?:dias?|days?)$/.test(l)) return "days";
  if (/^(?:m[eê]s(?:es)?|months?)$/.test(l)) return "months";
  return "money";
}

function collectNumbers(v: unknown, out: Set<number>): void {
  if (typeof v === "number") out.add(v);
  else if (Array.isArray(v)) v.forEach((x) => collectNumbers(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectNumbers(x, out));
}

function collectStrings(v: unknown, out: string[]): void {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectStrings(x, out));
}

const near = (set: Set<number>, v: number) => [...set].some((x) => Math.abs(x - v) < 1e-6);

/** Contexto da oração em volta do número sugere que não é esforço de projeto (SLA, reunião, garantia...). */
function isNonEffortContext(s: string, start: number, end: number): boolean {
  const before = s.slice(Math.max(0, start - 60), start);
  const clauseBefore = before.slice(before.search(/[^.;!?\n]*$/));
  const after = s.slice(end, end + 30);
  const clauseAfter = after.split(/[.;!?\n]/)[0]!;
  const win = clauseBefore + " " + clauseAfter;
  return NON_EFFORT.test(win) && !EFFORT_CUE.test(win);
}

/**
 * Números "de esforço" citados no texto (horas, semanas, dias, meses, valores) que não existem em
 * `estimates`. Só inspeciona números com unidade ou moeda; outros (ex.: "2 s", "50 usuários")
 * são livres. `diagram_mermaid` é ignorado. Ver limitações no cabeçalho desta seção.
 */
export function findNumberViolations(text: ProposalTextOutput, est: ComposerEstimates): string[] {
  const hours = new Set<number>();
  collectNumbers(est.estimates, hours);
  const pairs = new Set<string>();
  const addPair = (a: unknown, b: unknown) => {
    if (typeof a === "number" && typeof b === "number") pairs.add(`${a}|${b}`);
  };
  addPair(est.estimates.total_hours_min, est.estimates.total_hours_max);
  for (const t of Object.values(est.estimates.totals_by_profile ?? {})) addPair(t.hours_min, t.hours_max);
  for (const l of est.estimates.lines ?? []) addPair(l.hours_min, l.hours_max);

  const weeks = new Set<number>();
  if (typeof est.total_weeks === "number") weeks.add(est.total_weeks);
  for (const p of [...(est.team ?? []), ...(est.schedule ?? [])]) {
    const w = (p as { duration_weeks?: unknown }).duration_weeks;
    if (typeof w === "number") weeks.add(w);
  }
  const days = new Set<number>();
  const months = new Set<number>();
  for (const w of weeks) {
    days.add(w * 7);
    days.add(w * 5);
    months.add(Math.round(w / 4.345));
    months.add(Math.round(w / 4));
  }
  const money = new Set<number>();
  const c = (est.commercial ?? {}) as { total_min?: unknown; total_max?: unknown; hourly_rates?: unknown };
  collectNumbers([c.total_min, c.total_max, c.hourly_rates], money);
  const allowedFor: Record<Kind, Set<number>> = { hours, weeks, days, months, money };

  const strings: string[] = [];
  const { architecture, ...rest } = text;
  collectStrings(rest, strings);
  collectStrings({ ...architecture, diagram_mermaid: null }, strings);

  const bad = new Set<string>();
  for (const s of strings) {
    for (const m of s.matchAll(NUM_RE)) {
      const start = m.index!;
      let end = start + m[0].length;
      if (LABEL_BEFORE.test(s.slice(0, start))) continue; // "Fase 1", "Sprint 2": rótulo, não esforço
      let value = parseNum(m[2]!);
      const mult = MULT_AFTER.exec(s.slice(end));
      if (mult) {
        value *= multiplier(mult[1]);
        end += mult[0].length;
      }
      const tail = s.slice(end);
      const u = UNIT_AFTER.exec(tail);
      let kind: Kind;
      let secondValue: number | null = null;
      if (m[1]) kind = "money";
      else if (u) kind = kindOfUnit(u[1]!);
      else {
        // faixa "X a Y unidade": X herda a unidade de Y
        const r = RANGE_AFTER.exec(tail);
        const u2 = r ? UNIT_AFTER.exec(tail.slice(r[0].length)) : null;
        if (!r || !u2) continue;
        kind = kindOfUnit(u2[1]!);
        secondValue = parseNum(r[1]!);
      }
      if (kind !== "money" && isNonEffortContext(s, start, end + (u ? u[0].length : 0))) continue;
      if (!near(allowedFor[kind], value)) {
        bad.add(m[0].trim());
        continue;
      }
      if (kind === "hours" && secondValue !== null && near(hours, secondValue) && !pairs.has(`${value}|${secondValue}`)) {
        bad.add(`${value}–${secondValue}`);
      }
    }
  }
  return [...bad];
}

export class NumbersChangedError extends AiOutputInvalidError {
  constructor(readonly violations: string[]) {
    super(`O texto citou números fora das estimativas: ${violations.join(", ")}`, violations);
    this.name = "NumbersChangedError";
  }
}

/** Lança se o texto citar horas/semanas/valores que não constam em `estimates`. */
export function assertNumbersUnchanged(text: ProposalTextOutput, est: ComposerEstimates): void {
  const v = findNumberViolations(text, est);
  if (v.length > 0) throw new NumbersChangedError(v);
}

/** Módulos devolvidos devem ser exatamente os recebidos (nem novos, nem faltando). */
export function assertModulesMatch(text: ProposalTextOutput, analysis: MeetingAnalysis): void {
  const expected = analysis.modules.map((m) => m.id).sort();
  const got = text.modules.map((m) => m.id).sort();
  if (JSON.stringify(expected) !== JSON.stringify(got)) {
    throw new AiOutputInvalidError(`Módulos da proposta (${got.join(",")}) diferem dos recebidos (${expected.join(",")})`);
  }
}

function buildInput(analysis: MeetingAnalysis, est: ComposerEstimates, vendor: VendorProfileInput, feedback?: string) {
  // Sem source_refs/metadados: o redator não precisa de citações nem de ids de revisão.
  const strip = <T extends { source_refs: unknown; review_status: unknown; reviewer_note: unknown }>(items: T[]) =>
    items.map(({ source_refs: _s, review_status: _r, reviewer_note: _n, ...rest }) => rest);
  const payload = {
    analysis: {
      summary: analysis.summary,
      participants: analysis.participants,
      client_needs: strip(analysis.client_needs),
      requirements: strip(analysis.requirements),
      modules: analysis.modules,
      decisions: strip(analysis.decisions),
      commitments: strip(analysis.commitments),
      open_issues: strip(analysis.open_issues),
      tech_suggestions: strip(analysis.tech_suggestions),
      limitations: analysis.limitations,
    },
    estimates: est,
    vendor,
  };
  const base = JSON.stringify(payload, null, 2);
  return feedback ? `${base}\n\nCORREÇÃO NECESSÁRIA: ${feedback}` : base;
}

export const COMPOSE_MAX_ATTEMPTS = 3;

/**
 * Redige os textos da proposta. Só usa itens confirmed/edited (filtra de novo por segurança),
 * valida módulos e números e refaz até 3 tentativas (§6) se o texto violar as regras.
 */
export async function compose(
  analysisFiltered: MeetingAnalysis,
  estimates: ComposerEstimates,
  vendorProfile: VendorProfileInput,
): Promise<ProposalTextOutput> {
  const analysis = filterReviewed(analysisFiltered);
  const prompt = loadPrompt("compose_proposal");
  let feedback: string | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= COMPOSE_MAX_ATTEMPTS; attempt++) {
    try {
      const { data } = await structuredCompletion({
        prompt,
        input: buildInput(analysis, estimates, vendorProfile, feedback),
        schema: ProposalTextOutput,
        schemaName: "proposal_text",
        attempt,
      });
      assertModulesMatch(data, analysis);
      assertNumbersUnchanged(data, estimates);
      return data;
    } catch (e) {
      // Saída inválida do modelo (recusa, JSON/schema inválido) também vira repair (§6);
      // erros de provedor/configuração propagam.
      if (!(e instanceof AiOutputInvalidError || e instanceof z.ZodError || e instanceof SyntaxError)) throw e;
      lastError = e;
      feedback =
        e instanceof AiOutputInvalidError
          ? `${e.message}. Reescreva sem citar números de horas, semanas ou valores que não estejam em "estimates", e com exatamente os módulos de "analysis.modules".`
          : `A resposta anterior não seguiu o schema (${(e as Error).message}). Responda apenas com o JSON válido do schema pedido.`;
    }
  }
  throw lastError;
}
