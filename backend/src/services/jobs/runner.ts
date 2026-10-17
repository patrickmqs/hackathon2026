import { DomainError } from "../../core/errors.js";
import { logger } from "../../core/logging.js";
import type { FileStorage } from "../../core/storage.js";
import { EVENT_TYPES } from "../../domain/events.js";
import type { Repository } from "../../repositories/repo.js";
import type { AiPipeline } from "../ai/pipeline.js";

// Orquestrador de jobs em-processo — B5.
// Move a reunião por transcribing → analyzing → analysis_ready (ou failed) e detecta
// jobs parados além de JOB_STALE_MINUTES. `enqueue` é fire-and-forget (não bloqueia
// a resposta 202); `drain` aguarda os jobs em voo (determinístico em testes).

export function isMeetingStale(updatedAt: string, status: string, staleMs: number): boolean {
  if (staleMs <= 0) return false;
  if (status !== "transcribing" && status !== "analyzing") return false;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts > staleMs;
}

export interface JobRunnerDeps {
  repo: Repository;
  storage: FileStorage;
  pipeline: AiPipeline;
  staleMinutes?: number;
}

const TERMINAL = new Set(["analysis_ready", "reviewed", "failed"]);

export class JobRunner {
  private readonly repo: Repository;
  private readonly storage: FileStorage;
  private readonly pipeline: AiPipeline;
  private readonly staleMs: number;
  private readonly pending = new Set<Promise<void>>();

  constructor(deps: JobRunnerDeps) {
    this.repo = deps.repo;
    this.storage = deps.storage;
    this.pipeline = deps.pipeline;
    this.staleMs = (deps.staleMinutes ?? 0) * 60_000;
  }

  enqueue(meetingId: string): void {
    const job = this.run(meetingId).catch((err) => {
      logger.error("job execution failed", {
        meetingId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    this.pending.add(job);
    void job.finally(() => this.pending.delete(job));
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  async run(meetingId: string): Promise<void> {
    const meeting = await this.repo.getMeeting(meetingId);
    if (!meeting || TERMINAL.has(meeting.status)) return;

    try {
      await this.process(meetingId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha desconhecida no processamento.";
      await this.repo.updateMeeting(meetingId, {
        status: "failed",
        error: { code: "AI_PROVIDER_ERROR", message },
      });
    }
  }

  private async process(meetingId: string): Promise<void> {
    let meeting = await this.repo.getMeeting(meetingId);
    if (!meeting) return;

    if (isMeetingStale(meeting.updatedAt, meeting.status, this.staleMs)) {
      throw new DomainError("AI_PROVIDER_ERROR", "Job expirou (stale).");
    }

    if (meeting.status === "transcribing") {
      if (!meeting.audioPath) {
        throw new DomainError("AI_PROVIDER_ERROR", "Áudio ausente para transcrição.");
      }
      const audio = this.storage.read(meeting.audioPath);
      const result = await this.pipeline.transcribe(audio, { language: null });
      await this.repo.createTranscript({
        meetingId,
        text: result.text,
        segments: result.segments,
        metadata: result.metadata,
      });
      meeting = (await this.repo.updateMeeting(meetingId, { status: "analyzing" })) ?? meeting;
    }

    if (meeting.status === "analyzing") {
      const transcript = await this.repo.getTranscript(meetingId);
      if (!transcript) {
        throw new DomainError("AI_PROVIDER_ERROR", "Transcript não encontrado.");
      }
      const analysis = await this.pipeline.analyze(transcript.text, {
        meetingId,
        language: null,
        sourceType: meeting.sourceType as "text" | "audio",
      });
      await this.repo.createAnalysis({
        meetingId,
        content: analysis,
        promptVersion: analysis.meta.prompt_version,
      });
      await this.repo.updateMeeting(meetingId, { status: "analysis_ready" });
      await this.repo.createEvent({
        projectId: meeting.projectId,
        type: EVENT_TYPES.ANALYSIS_READY,
        actor: null,
        payload: { meeting_id: meetingId },
      });
    }
  }
}
