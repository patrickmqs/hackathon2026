import { Router } from "express";
import { z } from "zod";
import type { AppDeps } from "../core/deps.js";
import { DomainError } from "../core/errors.js";
import { parseBody } from "../core/http.js";
import { EVENT_TYPES } from "../domain/events.js";
import { requireDemoUser } from "../middleware/demo-user.js";
import type { MeetingAnalysis } from "../schemas/analysis.js";
import { MeetingAnalysisSchema } from "../schemas/analysis.js";
import { ChatMessage, applyReviewActions, countPending } from "../services/review/agent.js";

// Rotas de Análise — API_SPEC §4.4, montadas em /meetings/:meetingId/analysis.
const CompleteReviewSchema = z.object({
  accept_pending_as_confirmed: z.boolean().optional(),
});

const ChatSchema = z.object({ messages: z.array(ChatMessage).max(40).default([]) });

const ANALYSIS_READY = new Set(["analysis_ready", "reviewed"]);

export function analysisRouter(deps: AppDeps): Router {
  const { repo, reviewAgent } = deps;
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res) => {
    const meetingId = (req.params as Record<string, string>).meetingId;
    const meeting = await repo.getMeeting(meetingId);
    if (!meeting) throw new DomainError("NOT_FOUND", "Reunião não encontrada.");
    if (!ANALYSIS_READY.has(meeting.status)) {
      throw new DomainError("MEETING_NOT_READY", "Análise ainda não está pronta.");
    }
    const analysis = await repo.getAnalysis(meetingId);
    if (!analysis) throw new DomainError("MEETING_NOT_READY", "Análise não encontrada.");
    res.json(analysis.content);
  });

  router.put("/", requireDemoUser, async (req, res) => {
    const meetingId = (req.params as Record<string, string>).meetingId;
    const demoUser = res.locals.demoUser as string;
    const meeting = await repo.getMeeting(meetingId);
    if (!meeting) throw new DomainError("NOT_FOUND", "Reunião não encontrada.");
    const analysis = await repo.getAnalysis(meetingId);
    if (!analysis) throw new DomainError("MEETING_NOT_READY", "Análise não encontrada.");

    if (analysis.reviewCompleted) {
      const proposals = await repo.listProposals(meeting.projectId);
      if (proposals.some((p) => p.meetingId === meetingId)) {
        throw new DomainError("ANALYSIS_LOCKED", "Revisão concluída; proposta já gerada.");
      }
    }

    const body = parseBody(MeetingAnalysisSchema, req.body);
    const storedMeta = (analysis.content as MeetingAnalysis).meta;
    const updatedContent: MeetingAnalysis = {
      ...body,
      review_completed: analysis.reviewCompleted,
      meta: { ...storedMeta, reviewed_by: demoUser, reviewed_at: new Date().toISOString() },
    };
    await repo.updateAnalysis(analysis.id, { content: updatedContent });
    res.json(updatedContent);
  });

  router.post("/complete-review", requireDemoUser, async (req, res) => {
    const meetingId = (req.params as Record<string, string>).meetingId;
    const demoUser = res.locals.demoUser as string;
    const meeting = await repo.getMeeting(meetingId);
    if (!meeting) throw new DomainError("NOT_FOUND", "Reunião não encontrada.");
    const analysis = await repo.getAnalysis(meetingId);
    if (!analysis) throw new DomainError("MEETING_NOT_READY", "Análise não encontrada.");

    const input = parseBody(CompleteReviewSchema, req.body ?? {});
    const content = analysis.content as MeetingAnalysis;
    const pending = findPendingIds(content);
    if (pending.length > 0 && !input.accept_pending_as_confirmed) {
      throw new DomainError("ANALYSIS_REVIEW_INCOMPLETE", "Existem itens pendentes de revisão.", {
        pending_ids: pending,
      });
    }

    const now = new Date().toISOString();
    const updatedContent: MeetingAnalysis = {
      ...content,
      review_completed: true,
      meta: { ...content.meta, reviewed_by: demoUser, reviewed_at: now },
    };
    await repo.updateAnalysis(analysis.id, {
      content: updatedContent,
      reviewCompleted: true,
      reviewedBy: demoUser,
      reviewedAt: now,
    });
    await repo.updateMeeting(meetingId, { status: "reviewed" });
    await repo.createEvent({
      projectId: meeting.projectId,
      type: EVENT_TYPES.ANALYSIS_REVIEWED,
      actor: demoUser,
      payload: { meeting_id: meetingId },
    });
    res.json(updatedContent);
  });

  // Revisão agêntica: o agente investiga a transcrição, resolve o que ela já responde (com citação) e
  // conversa com o humano sobre o resto; a resposta do humano vira a marcação dos itens. Sem mensagens = abertura.
  router.post("/chat", requireDemoUser, async (req, res) => {
    const meetingId = (req.params as Record<string, string>).meetingId;
    const demoUser = res.locals.demoUser as string;
    if (!reviewAgent) throw new DomainError("AI_PROVIDER_NOT_CONFIGURED", "O assistente de revisão não está configurado.");
    const meeting = await repo.getMeeting(meetingId);
    if (!meeting) throw new DomainError("NOT_FOUND", "Reunião não encontrada.");
    const analysis = await repo.getAnalysis(meetingId);
    if (!analysis) throw new DomainError("MEETING_NOT_READY", "Análise não encontrada.");
    if (analysis.reviewCompleted) throw new DomainError("ANALYSIS_LOCKED", "Revisão já concluída.");

    const { messages } = parseBody(ChatSchema, req.body ?? {});
    const content = analysis.content as MeetingAnalysis;
    const transcriptText = (await repo.getTranscript(meetingId))?.text ?? "";
    let turn;
    try {
      turn = await reviewAgent({ analysis: content, messages, transcriptText });
    } catch (err) {
      throw new DomainError("AI_PROVIDER_ERROR", err instanceof Error ? err.message : "Falha no assistente de revisão.");
    }

    // As regras de segurança (citação verificada na transcrição; resposta do humano) vivem no agente.
    const { analysis: updated, applied } = applyReviewActions(content, turn.actions);

    let finalContent = updated;
    if (applied.length > 0) {
      finalContent = { ...updated, meta: { ...updated.meta, reviewed_by: demoUser, reviewed_at: new Date().toISOString() } };
      await repo.updateAnalysis(analysis.id, { content: finalContent });
    }
    res.json({ reply: turn.reply, applied, pending_count: countPending(finalContent), analysis: finalContent });
  });

  return router;
}

function findPendingIds(content: MeetingAnalysis): string[] {
  const arrays: Array<Array<{ id: string; review_status: string }>> = [
    content.client_needs,
    content.requirements,
    content.decisions,
    content.commitments,
    content.open_issues,
    content.tech_suggestions,
  ];
  const pending: string[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (item.review_status === "pending") pending.push(item.id);
    }
  }
  return pending;
}
