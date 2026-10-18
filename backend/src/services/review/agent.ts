// Agente de revisão: investiga a transcrição, resolve sozinho o que ela já responde (com citação literal)
// e conversa com o humano só sobre o que precisa de decisão dele. As respostas do humano também viram
// a marcação de revisão dos itens da análise (confirmed / edited / rejected / needs_clarification).
import type OpenAI from "openai";
import { z } from "zod";
import { toolStep } from "../../integrations/openai/client.js";
import type { MeetingAnalysis } from "../../schemas/analysis.js";
import { loadPrompt } from "../aiAnalysis/prompts/loader.js";

export const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const REVIEW_ACTION_STATUS = ["confirmed", "edited", "rejected", "needs_clarification"] as const;
export type ReviewStatusAction = (typeof REVIEW_ACTION_STATUS)[number];

export interface ReviewAction {
  item_ids: string[];
  review_status: ReviewStatusAction;
  new_text: string | null;
  note: string | null;
  /** Quem decidiu: a transcrição (IA, com citação verificada) ou a resposta do humano no chat. */
  basis: "transcript" | "human_answer";
}

export interface ReviewTurnOutput {
  reply: string;
  actions: ReviewAction[];
}

export type ReviewAgent = (input: {
  analysis: MeetingAnalysis;
  messages: ChatMessage[];
  transcriptText: string;
}) => Promise<ReviewTurnOutput>;

const COLLECTIONS = ["client_needs", "requirements", "decisions", "commitments", "open_issues", "tech_suggestions"] as const;
export type Collection = (typeof COLLECTIONS)[number];

// Campo de texto editável de cada coleção (mesmo critério da edição manual na tela de revisão).
const TEXT_FIELD: Record<Collection, string> = {
  client_needs: "description",
  requirements: "title",
  decisions: "description",
  commitments: "description",
  open_issues: "description",
  tech_suggestions: "description",
};

type Item = {
  id: string;
  review_status: string;
  reviewer_note?: string | null;
  source_refs?: { quote: string }[];
  [k: string]: unknown;
};

const itemsOf = (a: MeetingAnalysis, c: Collection) => a[c] as unknown as Item[];
const isPending = (i: Item) => i.review_status === "pending" || i.review_status === "needs_clarification";

export function countPending(a: MeetingAnalysis): number {
  return COLLECTIONS.reduce((n, c) => n + itemsOf(a, c).filter((i) => i.review_status === "pending").length, 0);
}

function describe(c: Collection, i: Item) {
  const base = { id: i.id, kind: c, review_status: i.review_status } as Record<string, unknown>;
  switch (c) {
    case "requirements":
      base.text = `${i.title}: ${i.description}`;
      break;
    case "commitments":
      base.text = `${i.owner}: ${i.description}`;
      base.status = i.status;
      base.due_text = i.due_text ?? null;
      break;
    case "decisions":
      base.text = i.description;
      base.status = i.status;
      break;
    case "open_issues":
      base.type = i.type;
      base.text = i.description;
      base.suggested_question = i.suggested_question ?? null;
      base.related_ids = i.related_ids ?? [];
      break;
    default:
      base.text = i.description;
  }
  const quote = i.source_refs?.[0]?.quote;
  if (quote) base.quote = quote.slice(0, 160);
  return base;
}

const MAX_ITEMS = 40;
// Ordem de prioridade da conversa: pendências, decisões, compromissos, sugestões, necessidades e requisitos.
const PRIORITY: Collection[] = ["open_issues", "decisions", "commitments", "tech_suggestions", "client_needs", "requirements"];

function pendingItems(analysis: MeetingAnalysis): { c: Collection; item: Item }[] {
  return PRIORITY.flatMap((c) => itemsOf(analysis, c).filter(isPending).map((item) => ({ c, item })));
}

export function buildReviewInput(analysis: MeetingAnalysis, messages: ChatMessage[]): string {
  const all = pendingItems(analysis);
  const shown = all.slice(0, MAX_ITEMS).map(({ c, item }) => describe(c, item));
  const total = PRIORITY.reduce((n, c) => n + itemsOf(analysis, c).length, 0);
  const conversa = messages.length
    ? messages.map((m) => `${m.role === "user" ? "HUMANO" : "ASSISTENTE"}: ${m.content}`).join("\n")
    : "(sem mensagens: faça a abertura)";
  return (
    `## Itens pendentes (${all.length}${all.length > shown.length ? `, mostrando ${shown.length}` : ""})\n\n` +
    `${JSON.stringify(shown, null, 1)}\n\n## Itens já resolvidos: ${total - all.length}\n\n## Conversa\n\n${conversa}`
  );
}

export interface AppliedAction {
  id: string;
  kind: Collection;
  review_status: ReviewStatusAction;
  title: string;
  /** "ai": resolvido pela IA com evidência da transcrição; "human": resposta do humano no chat. */
  by: "ai" | "human";
}

/** Aplica as ações à análise (função pura): ignora ids desconhecidos e nunca muta a entrada. */
export function applyReviewActions(
  analysis: MeetingAnalysis,
  actions: ReviewAction[],
): { analysis: MeetingAnalysis; applied: AppliedAction[] } {
  const next = { ...analysis } as Record<string, unknown>;
  for (const c of COLLECTIONS) next[c] = itemsOf(analysis, c).map((i) => ({ ...i }));
  const applied: AppliedAction[] = [];

  for (const action of actions) {
    for (const id of new Set(action.item_ids)) {
      for (const c of COLLECTIONS) {
        const item = (next[c] as Item[]).find((i) => i.id === id);
        if (!item) continue;
        item.review_status = action.review_status;
        if (action.note?.trim()) item.reviewer_note = action.note.trim().slice(0, 400);
        const field = TEXT_FIELD[c];
        if (action.review_status === "edited" && action.new_text?.trim()) {
          const text = action.new_text.trim();
          item[field] = c === "commitments" ? text.replace(/^[^:]+:\s*/, "") : text;
        }
        // Confirmação/correção de decisão ou compromisso incerto passa a valer como firme.
        if (action.review_status === "confirmed" || action.review_status === "edited") {
          if (c === "decisions" && item.status === "pending_validation") item.status = "confirmed";
          if (c === "commitments" && (item.status === "tentative" || item.status === "conditional")) item.status = "confirmed";
        }
        applied.push({
          id,
          kind: c,
          review_status: action.review_status,
          title: String(item[field] ?? "").slice(0, 120),
          by: action.basis === "transcript" ? "ai" : "human",
        });
        break;
      }
    }
  }
  return { analysis: next as unknown as MeetingAnalysis, applied };
}

// ---------------------------------------------------------------------------
// Ferramentas do agente
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Trechos da transcrição que mais combinam com a consulta (busca por palavras, sem IA). */
export function searchTranscript(text: string, query: string, max = 5): string[] {
  const tokens = [...new Set(norm(query).split(" ").filter((t) => t.length >= 3))];
  if (!tokens.length) return [];
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) lines = text.split(/(?<=[.!?])\s+/).map((l) => l.trim()).filter(Boolean);
  return lines
    .map((line, i) => {
      const n = norm(line);
      const score = tokens.filter((t) => n.includes(t)).length;
      return { line, i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    // Junta a fala seguinte: a resposta costuma vir logo depois da pergunta.
    .map((x) => [x.line, lines[x.i + 1]].filter(Boolean).join("\n").slice(0, 420));
}

/** A citação existe literalmente (normalizada) na transcrição e tem tamanho mínimo. */
export function quoteInText(quote: string, text: string): boolean {
  const q = norm(quote);
  return q.length >= 12 && norm(text).includes(q);
}

interface ToolContext {
  transcriptText: string;
  hasHuman: boolean;
  pendingIds: Set<string>;
  actions: ReviewAction[];
}

const ResolveArgs = z.object({
  item_ids: z.array(z.string()).min(1),
  review_status: z.enum(REVIEW_ACTION_STATUS),
  basis: z.enum(["transcript", "human_answer"]),
  evidence_quote: z.string().nullable().optional(),
  new_text: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

/** Executa uma ferramenta e devolve o resultado (JSON) que volta ao modelo. Regras de segurança ficam aqui. */
export function runReviewTool(ctx: ToolContext, name: string, rawArgs: unknown): { result: unknown; reply?: string } {
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  if (name === "search_transcript") {
    const hits = searchTranscript(ctx.transcriptText, String(args.query ?? ""));
    return { result: hits.length ? { trechos: hits } : { trechos: [], aviso: "nada encontrado; tente outras palavras" } };
  }
  if (name === "reply_to_user") {
    const message = String(args.message ?? "").trim();
    if (!message) return { result: { erro: "mensagem vazia" } };
    return { result: { ok: true }, reply: message };
  }
  if (name === "resolve_items") {
    const parsed = ResolveArgs.safeParse(args);
    if (!parsed.success) return { result: { erro: "argumentos inválidos", detalhe: parsed.error.message.slice(0, 200) } };
    const a = parsed.data;
    if (a.basis === "human_answer" && !ctx.hasHuman) {
      return { result: { erro: "ainda não há resposta do humano; use basis=transcript com citação ou pergunte a ele" } };
    }
    let note = a.note?.trim() ?? "";
    if (a.basis === "transcript") {
      if (!a.evidence_quote || !quoteInText(a.evidence_quote, ctx.transcriptText)) {
        return { result: { erro: "citação não encontrada literalmente na transcrição; use search_transcript e cite o trecho exato" } };
      }
      note = `${note ? `${note} · ` : ""}Resolvido pela IA — evidência: «${a.evidence_quote.trim().slice(0, 200)}»`;
    }
    const valid = [...new Set(a.item_ids)].filter((id) => ctx.pendingIds.has(id));
    if (!valid.length) return { result: { erro: "nenhum desses ids está pendente" } };
    valid.forEach((id) => ctx.pendingIds.delete(id));
    ctx.actions.push({
      item_ids: valid,
      review_status: a.review_status,
      new_text: a.new_text ?? null,
      note: note || null,
      basis: a.basis,
    });
    return { result: { ok: true, resolvidos: valid.length, ainda_pendentes: ctx.pendingIds.size } };
  }
  return { result: { erro: `ferramenta desconhecida: ${name}` } };
}

const TOOLS: OpenAI.Responses.FunctionTool[] = [
  {
    type: "function",
    name: "search_transcript",
    description: "Busca na transcrição os trechos que mais combinam com a consulta. Use para investigar se a reunião já responde um item pendente.",
    strict: false,
    parameters: { type: "object", properties: { query: { type: "string", description: "palavras-chave do assunto" } }, required: ["query"] },
  },
  {
    type: "function",
    name: "resolve_items",
    description:
      "Marca itens pendentes como resolvidos. basis=transcript: a transcrição já responde (evidence_quote OBRIGATÓRIA e literal). basis=human_answer: o humano acabou de responder no chat.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        item_ids: { type: "array", items: { type: "string" } },
        review_status: { type: "string", enum: [...REVIEW_ACTION_STATUS] },
        basis: { type: "string", enum: ["transcript", "human_answer"] },
        evidence_quote: { type: ["string", "null"], description: "trecho literal da transcrição (basis=transcript)" },
        new_text: { type: ["string", "null"], description: "texto corrigido (review_status=edited)" },
        note: { type: ["string", "null"], description: "resumo curto do motivo (até 140 caracteres)" },
      },
      required: ["item_ids", "review_status", "basis"],
    },
  },
  {
    type: "function",
    name: "reply_to_user",
    description: "Envia a mensagem final ao humano e encerra o turno. Chame sempre por último, depois de investigar e resolver.",
    strict: false,
    parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  },
];

const MAX_STEPS = 7;

/** Agente real: laço de ferramentas com modelo pequeno (barato). */
export function createOpenAiReviewAgent(): ReviewAgent {
  return async ({ analysis, messages, transcriptText }) => {
    const prompt = loadPrompt("review_chat");
    const model = process.env.OPENAI_MODEL_CHAT ?? "gpt-4.1-mini";
    const ctx: ToolContext = {
      transcriptText,
      hasHuman: messages.some((m) => m.role === "user"),
      pendingIds: new Set(pendingItems(analysis).map(({ item }) => item.id)),
      actions: [],
    };
    const input: OpenAI.Responses.ResponseInput = [{ role: "user", content: buildReviewInput(analysis, messages) }];
    let reply: string | null = null;

    for (let step = 0; step < MAX_STEPS && reply === null; step++) {
      const res = await toolStep({ model, instructions: prompt.system, input, tools: TOOLS, temperature: prompt.temperature, label: `${prompt.name}@${prompt.version}` });
      input.push(...(res.output as unknown as OpenAI.Responses.ResponseInput));
      const calls = res.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === "function_call");
      if (!calls.length) {
        reply = res.output_text?.trim() || null;
        break;
      }
      for (const call of calls) {
        let args: unknown = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch { /* argumentos inválidos viram erro da ferramenta */ }
        const out = runReviewTool(ctx, call.name, args);
        if (out.reply) reply = out.reply;
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(out.result) });
      }
    }

    if (!reply) {
      reply = ctx.actions.length
        ? "Resolvi o que a reunião já respondia. Pode me dizer como seguimos com o restante?"
        : "Pode me contar como você quer seguir com os pontos pendentes?";
    }
    return { reply, actions: ctx.actions };
  };
}
