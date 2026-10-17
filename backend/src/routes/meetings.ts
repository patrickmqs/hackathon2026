import { Router } from "express";
import type { AppDeps } from "../core/deps.js";
import { DomainError } from "../core/errors.js";
import { toMeetingDto } from "../core/serializers.js";
import { canReprocess } from "../domain/meeting.js";
import type { MeetingStatus } from "../schemas/common.js";

// Rotas de Reunião — API_SPEC §4.3 (GET + reprocess; a criação fica em /projects/{id}/meetings).
export function meetingsRouter(deps: AppDeps): Router {
  const { repo, jobs } = deps;
  const router = Router();

  router.get("/:meetingId", async (req, res) => {
    const meeting = await repo.getMeeting(req.params.meetingId);
    if (!meeting) throw new DomainError("NOT_FOUND", "Reunião não encontrada.");
    const transcript = await repo.getTranscript(meeting.id);
    res.json(toMeetingDto(meeting, transcript));
  });

  // POST /meetings/:meetingId/reprocess — reexecuta análise (e transcrição, se áudio
  // sem transcript). Só permitido em failed / analysis_ready / reviewed (API_SPEC §4.3).
  router.post("/:meetingId/reprocess", async (req, res) => {
    const meetingId = req.params.meetingId as string;
    const meeting = await repo.getMeeting(meetingId);
    if (!meeting) throw new DomainError("NOT_FOUND", "Reunião não encontrada.");

    if (!canReprocess(meeting.status as MeetingStatus)) {
      throw new DomainError(
        "MEETING_NOT_READY",
        "Reunião não está em um estado que permita reprocessamento.",
      );
    }

    let nextStatus = "analyzing";
    if (meeting.sourceType === "audio") {
      const transcript = await repo.getTranscript(meetingId);
      if (!transcript) nextStatus = "transcribing";
    }

    await repo.updateMeeting(meetingId, { status: nextStatus, error: null });
    jobs?.enqueue(meetingId);

    const updated = await repo.getMeeting(meetingId);
    res.status(202).json(toMeetingDto(updated!, null));
  });

  return router;
}
