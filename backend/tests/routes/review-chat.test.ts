import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { FileStorage } from "../../src/core/storage.js";
import { MemoryRepository } from "../../src/repositories/memory.js";
import { JobRunner } from "../../src/services/jobs/runner.js";
import { __setTestHooks } from "../../src/integrations/openai/client.js";
import {
  applyReviewActions,
  buildReviewInput,
  countPending,
  createOpenAiReviewAgent,
  quoteInText,
  runReviewTool,
  searchTranscript,
  type ReviewAction,
  type ReviewAgent,
} from "../../src/services/review/agent.js";
import { SuccessfulStubPipeline } from "../helpers/successful-stub-pipeline.js";

// O laço do agente grava em ai_runs.jsonl: manda para a pasta temporária para não sujar o log real.
process.env.AI_RUNS_LOG = join(tmpdir(), "proposal-ai-test-ai-runs.jsonl");

async function setup(agent: ReviewAgent | undefined) {
  const repo = new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "proposal-ai-")));
  const jobs = new JobRunner({ repo, storage, pipeline: new SuccessfulStubPipeline(), staleMinutes: 0 });
  const app = createApp({ repo, storage, jobs, reviewAgent: agent });
  const project = (await request(app).post("/projects").send({ name: "P", client: { company: "Acme" } })).body;
  const meeting = (await request(app).post(`/projects/${project.id}/meetings`).send({ transcript_text: "reunião" })).body;
  await jobs.drain();
  // O stub devolve listas vazias: semeia itens pendentes para exercitar a revisão.
  const stored = (await repo.getAnalysis(meeting.id))!;
  const base = { confidence: "high", source_refs: [{ quote: "trecho dito na reunião" }], review_status: "pending", reviewer_note: null };
  const seeded = {
    ...(stored.content as object),
    requirements: ["r1", "r2", "r3"].map((id) => ({ ...base, id, title: `Requisito ${id}`, description: "desc", type: "functional" })),
    decisions: [{ ...base, id: "d1", description: "Decisão X", status: "pending_validation", agreed_by: [] }],
    commitments: [{ ...base, id: "c1", owner: "Ana", owner_side: "client", description: "Enviar lista", due_text: null, status: "tentative" }],
  };
  await repo.updateAnalysis(stored.id, { content: seeded as never });
  const analysis = (await request(app).get(`/meetings/${meeting.id}/analysis`)).body;
  return { app, meetingId: meeting.id as string, analysis };
}

const chat = (app: Awaited<ReturnType<typeof setup>>["app"], meetingId: string, messages: unknown[]) =>
  request(app).post(`/meetings/${meetingId}/analysis/chat`).set("X-Demo-User", "Marina").send({ messages });

describe("POST /meetings/:id/analysis/chat", () => {
  it("abertura: aplica o que o agente resolveu pela transcrição e devolve a pergunta", async () => {
    let received = -1;
    let gotTranscript = "";
    const agent: ReviewAgent = async ({ analysis, messages, transcriptText }) => {
      received = messages.length;
      gotTranscript = transcriptText;
      const id = analysis.requirements[0]!.id;
      return {
        reply: "Olá! Primeira pergunta?",
        actions: [{ item_ids: [id], review_status: "confirmed", new_text: null, note: "ok", basis: "transcript" }],
      };
    };
    const { app, meetingId, analysis } = await setup(agent);
    const before = countPending(analysis);
    const res = await chat(app, meetingId, []);
    expect(res.status).toBe(200);
    expect(received).toBe(0);
    expect(gotTranscript).toContain("reunião");
    expect(res.body.reply).toBe("Olá! Primeira pergunta?");
    expect(res.body.applied).toHaveLength(1);
    expect(res.body.applied[0].by).toBe("ai");
    expect(res.body.pending_count).toBe(before - 1);
  });

  it("resposta do humano aplica confirmed/edited/rejected e persiste", async () => {
    const { app, meetingId, analysis } = await setup(async ({ analysis: a }) => {
      const [r1, r2, r3] = a.requirements;
      return {
        reply: "Anotado.",
        actions: [
          { item_ids: [r1!.id], review_status: "confirmed", new_text: null, note: "Humano confirmou", basis: "human_answer" },
          ...(r2 ? [{ item_ids: [r2.id], review_status: "edited" as const, new_text: "Título corrigido", note: null, basis: "human_answer" as const }] : []),
          ...(r3 ? [{ item_ids: [r3.id], review_status: "rejected" as const, new_text: null, note: null, basis: "human_answer" as const }] : []),
          { item_ids: ["id-que-nao-existe"], review_status: "confirmed", new_text: null, note: null, basis: "human_answer" },
        ],
      };
    });
    const res = await chat(app, meetingId, [
      { role: "assistant", content: "Pergunta?" },
      { role: "user", content: "Sim, está certo" },
    ]);
    expect(res.status).toBe(200);
    const ids = analysis.requirements.map((r: { id: string }) => r.id);
    expect(res.body.applied.map((x: { id: string }) => x.id)).toContain(ids[0]);
    expect(res.body.applied.map((x: { id: string }) => x.id)).not.toContain("id-que-nao-existe");

    const saved = (await request(app).get(`/meetings/${meetingId}/analysis`)).body;
    expect(saved.requirements[0].review_status).toBe("confirmed");
    expect(saved.requirements[0].reviewer_note).toBe("Humano confirmou");
    if (ids[1]) {
      expect(saved.requirements[1].review_status).toBe("edited");
      expect(saved.requirements[1].title).toBe("Título corrigido");
    }
    expect(res.body.pending_count).toBeLessThan(countPending(analysis));
  });

  it("503/500 AI_PROVIDER_NOT_CONFIGURED sem agente", async () => {
    const { app, meetingId } = await setup(undefined);
    const res = await chat(app, meetingId, []);
    expect(res.body.error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");
  });

  it("400 com mensagem inválida", async () => {
    const { app, meetingId } = await setup(async () => ({ reply: "x", actions: [] }));
    const res = await chat(app, meetingId, [{ role: "system", content: "x" }]);
    expect(res.status).toBe(400);
  });

  it("409 ANALYSIS_LOCKED depois de concluir a revisão", async () => {
    const { app, meetingId } = await setup(async () => ({ reply: "x", actions: [] }));
    await request(app)
      .post(`/meetings/${meetingId}/analysis/complete-review`)
      .set("X-Demo-User", "Marina")
      .send({ accept_pending_as_confirmed: true });
    const res = await chat(app, meetingId, []);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ANALYSIS_LOCKED");
  });
});

describe("applyReviewActions / buildReviewInput", () => {
  it("decisão e compromisso incertos passam a firmes ao confirmar; entrada lista só pendentes", async () => {
    const { analysis } = await setup(undefined);
    const a = structuredClone(analysis);
    if (a.decisions[0]) a.decisions[0].status = "pending_validation";
    if (a.commitments[0]) a.commitments[0].status = "tentative";
    const ids = [a.decisions[0]?.id, a.commitments[0]?.id].filter(Boolean) as string[];
    const out = applyReviewActions(a, [{ item_ids: ids, review_status: "confirmed", new_text: null, note: null, basis: "human_answer" }]);
    if (a.decisions[0]) expect(out.analysis.decisions[0]!.status).toBe("confirmed");
    if (a.commitments[0]) expect(out.analysis.commitments[0]!.status).toBe("confirmed");
    // não muta a entrada
    expect(a.requirements[0]!.review_status).toBe(analysis.requirements[0].review_status);

    const input = buildReviewInput(out.analysis, [{ role: "user", content: "oi" }]);
    expect(input).toContain("HUMANO: oi");
    for (const id of ids) expect(input).not.toContain(`"id": "${id}"`);
  });
});

const TRANSCRIPT = [
  "Rafael: Qual o prazo para remarcar?",
  "Helena: Pode remarcar até vinte e quatro horas antes.",
  "Marcos: Eu pergunto ao fornecedor sobre a API até sexta-feira.",
].join("\n");

describe("ferramentas do agente", () => {
  const ctx = (hasHuman = false) => ({ transcriptText: TRANSCRIPT, hasHuman, pendingIds: new Set(["d1", "o1"]), actions: [] as ReviewAction[] });

  it("search_transcript acha o trecho e quoteInText exige citação literal", () => {
    expect(searchTranscript(TRANSCRIPT, "prazo remarcar")[0]).toContain("vinte e quatro horas");
    expect(searchTranscript(TRANSCRIPT, "xyz")).toEqual([]);
    expect(quoteInText("remarcar até vinte e quatro horas antes", TRANSCRIPT)).toBe(true);
    expect(quoteInText("remarcar até doze horas", TRANSCRIPT)).toBe(false);
    expect(quoteInText("curto", TRANSCRIPT)).toBe(false);
  });

  it("resolve_items por transcrição só passa com citação verificada e id pendente", () => {
    const c = ctx();
    const bad = runReviewTool(c, "resolve_items", { item_ids: ["d1"], review_status: "confirmed", basis: "transcript", evidence_quote: "doze horas de prazo" });
    expect((bad.result as { erro?: string }).erro).toMatch(/citação/);
    expect(c.actions).toHaveLength(0);

    const ok = runReviewTool(c, "resolve_items", { item_ids: ["d1", "zzz"], review_status: "confirmed", basis: "transcript", evidence_quote: "Pode remarcar até vinte e quatro horas antes", note: "prazo" });
    expect((ok.result as { resolvidos: number }).resolvidos).toBe(1);
    expect(c.actions[0]!.item_ids).toEqual(["d1"]);
    expect(c.actions[0]!.note).toContain("Resolvido pela IA");
    // já resolvido neste turno: não resolve de novo
    const again = runReviewTool(c, "resolve_items", { item_ids: ["d1"], review_status: "rejected", basis: "transcript", evidence_quote: "Pode remarcar até vinte e quatro horas antes" });
    expect((again.result as { erro?: string }).erro).toMatch(/pendente/);
  });

  it("basis=human_answer é recusada sem resposta do humano", () => {
    const sem = runReviewTool(ctx(false), "resolve_items", { item_ids: ["o1"], review_status: "rejected", basis: "human_answer" });
    expect((sem.result as { erro?: string }).erro).toMatch(/humano/);
    const c = ctx(true);
    const com = runReviewTool(c, "resolve_items", { item_ids: ["o1"], review_status: "rejected", basis: "human_answer" });
    expect((com.result as { ok?: boolean }).ok).toBe(true);
  });

  it("laço do agente: busca, resolve com evidência e responde", async () => {
    const calls: unknown[] = [];
    const script = [
      [{ type: "function_call", call_id: "c1", name: "search_transcript", arguments: JSON.stringify({ query: "prazo remarcar" }) }],
      [{ type: "function_call", call_id: "c2", name: "resolve_items", arguments: JSON.stringify({ item_ids: ["d1"], review_status: "confirmed", basis: "transcript", evidence_quote: "Pode remarcar até vinte e quatro horas antes" }) }],
      [{ type: "function_call", call_id: "c3", name: "reply_to_user", arguments: JSON.stringify({ message: "Resolvi o prazo pela reunião. E o API do fornecedor?" }) }],
    ];
    let n = 0;
    __setTestHooks({
      sleep: async () => undefined,
      client: { responses: { create: async (p: unknown) => { calls.push(p); return { output: script[n++]!, output_text: "", usage: { input_tokens: 1, output_tokens: 1 } }; } } } as never,
    });
    const base = { confidence: "high", source_refs: [], review_status: "pending", reviewer_note: null };
    const analysis = { client_needs: [], requirements: [], tech_suggestions: [], commitments: [], open_issues: [], decisions: [{ ...base, id: "d1", description: "Prazo 24h", status: "pending_validation", agreed_by: [] }] } as never;
    const out = await createOpenAiReviewAgent()({ analysis, messages: [], transcriptText: TRANSCRIPT });
    expect(calls).toHaveLength(3);
    expect(out.reply).toContain("Resolvi o prazo");
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0]!.basis).toBe("transcript");
    __setTestHooks({ client: null });
  });
});
