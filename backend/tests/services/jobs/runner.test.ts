import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStorage } from "../../../src/core/storage.js";
import { MemoryRepository } from "../../../src/repositories/memory.js";
import { StubAiPipeline } from "../../../src/services/ai/stub.js";
import { isMeetingStale, JobRunner } from "../../../src/services/jobs/runner.js";
import { SuccessfulStubPipeline } from "../../helpers/successful-stub-pipeline.js";

function makeRunner(staleMinutes = 0) {
  const repo = new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "proposal-ai-")));
  const jobs = new JobRunner({ repo, storage, pipeline: new SuccessfulStubPipeline(), staleMinutes });
  return { repo, storage, jobs };
}

async function createProject(repo: MemoryRepository) {
  return repo.createProject({ name: "P", description: null, client: {} });
}

describe("isMeetingStale", () => {
  it("detecta job parado além do limite", () => {
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(isMeetingStale(old, "analyzing", 60_000)).toBe(true);
  });

  it("não marca job recente como stale", () => {
    expect(isMeetingStale(new Date().toISOString(), "analyzing", 60_000)).toBe(false);
  });

  it("ignora status fora de transcribing/analyzing", () => {
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(isMeetingStale(old, "analysis_ready", 60_000)).toBe(false);
  });
});

describe("JobRunner (texto)", () => {
  it("move analyzing → analysis_ready e cria a análise", async () => {
    const { repo, jobs } = makeRunner();
    const project = await createProject(repo);
    const meeting = await repo.createMeeting({
      projectId: project.id,
      sourceType: "text",
      status: "analyzing",
      title: null,
      audioPath: null,
    });
    await repo.createTranscript({ meetingId: meeting.id, text: "transcrição", segments: [], metadata: {} });

    await jobs.run(meeting.id);

    expect((await repo.getMeeting(meeting.id))?.status).toBe("analysis_ready");
    expect((await repo.getAnalysis(meeting.id))?.content.meeting_summary).not.toBeNull();
  });

  it("não marca a análise como pronta quando o resumo não foi gerado", async () => {
    const repo = new MemoryRepository();
    const storage = new FileStorage(mkdtempSync(join(tmpdir(), "proposal-ai-")));
    class MissingSummaryPipeline extends StubAiPipeline {
      override async analyze(...args: Parameters<StubAiPipeline["analyze"]>) {
        return { ...await super.analyze(...args), meeting_summary: null };
      }
    }
    const jobs = new JobRunner({ repo, storage, pipeline: new MissingSummaryPipeline() });
    const project = await createProject(repo);
    const meeting = await repo.createMeeting({
      projectId: project.id,
      sourceType: "text",
      status: "analyzing",
      title: null,
      audioPath: null,
    });
    await repo.createTranscript({ meetingId: meeting.id, text: "transcrição", segments: [], metadata: {} });

    await jobs.run(meeting.id);

    expect((await repo.getMeeting(meeting.id))?.status).toBe("failed");
    expect((await repo.getMeeting(meeting.id))?.error?.message).toContain("Resumo da reunião não foi gerado");
    expect(await repo.getAnalysis(meeting.id)).toBeNull();
  });

  it("é idempotente quando a reunião já está terminal", async () => {
    const { repo, jobs } = makeRunner();
    const project = await createProject(repo);
    const meeting = await repo.createMeeting({
      projectId: project.id,
      sourceType: "text",
      status: "analysis_ready",
      title: null,
      audioPath: null,
    });
    await jobs.run(meeting.id);
    expect((await repo.getMeeting(meeting.id))?.status).toBe("analysis_ready");
  });
});

describe("JobRunner (áudio)", () => {
  it("transcreve e analisa até analysis_ready", async () => {
    const { repo, storage, jobs } = makeRunner();
    const project = await createProject(repo);
    const meeting = await repo.createMeeting({
      projectId: project.id,
      sourceType: "audio",
      status: "transcribing",
      title: null,
      audioPath: null,
    });
    const path = storage.saveAudio(meeting.id, "mp3", Buffer.from("audio"));
    await repo.updateMeeting(meeting.id, { audioPath: path });

    await jobs.run(meeting.id);

    expect((await repo.getMeeting(meeting.id))?.status).toBe("analysis_ready");
    expect(await repo.getTranscript(meeting.id)).not.toBeNull();
    expect((await repo.getAnalysis(meeting.id))?.content.meeting_summary).not.toBeNull();
  });
});
