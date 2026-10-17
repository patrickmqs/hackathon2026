import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { FileStorage } from "../../src/core/storage.js";
import { MemoryRepository } from "../../src/repositories/memory.js";
import { SuccessfulStubPipeline } from "../helpers/successful-stub-pipeline.js";
import { JobRunner } from "../../src/services/jobs/runner.js";

function makeApp() {
  const repo = new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "proposal-ai-")));
  const jobs = new JobRunner({ repo, storage, pipeline: new SuccessfulStubPipeline(), staleMinutes: 0 });
  const app = createApp({ repo, storage, jobs });
  return { app, repo, jobs };
}

async function createProject(app: ReturnType<typeof makeApp>["app"]): Promise<string> {
  const res = await request(app).post("/projects").send({ name: "P", client: { company: "Acme" } });
  return res.body.id as string;
}

async function createAnalyzedMeeting(app: ReturnType<typeof makeApp>["app"], jobs: JobRunner) {
  const projectId = await createProject(app);
  const created = await request(app)
    .post(`/projects/${projectId}/meetings`)
    .send({ transcript_text: "reunião de descoberta" });
  await jobs.drain();
  return created.body.id as string;
}

describe("GET /meetings/:id/analysis", () => {
  it("409 MEETING_NOT_READY antes de analysis_ready", async () => {
    const { app, repo } = makeApp();
    const projectId = await createProject(app);
    const meeting = await repo.createMeeting({
      projectId,
      sourceType: "text",
      status: "analyzing",
      title: null,
      audioPath: null,
    });
    const res = await request(app).get(`/meetings/${meeting.id}/analysis`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MEETING_NOT_READY");
  });

  it("200 com a análise após o job concluir", async () => {
    const { app, jobs } = makeApp();
    const meetingId = await createAnalyzedMeeting(app, jobs);
    const res = await request(app).get(`/meetings/${meetingId}/analysis`);
    expect(res.status).toBe(200);
    expect(res.body.meeting_id).toBe(meetingId);
    expect(res.body.review_completed).toBe(false);
  });
});

describe("PUT /meetings/:id/analysis", () => {
  it("exige X-Demo-User → 401", async () => {
    const { app, jobs } = makeApp();
    const meetingId = await createAnalyzedMeeting(app, jobs);
    const analysis = (await request(app).get(`/meetings/${meetingId}/analysis`)).body;
    const res = await request(app).put(`/meetings/${meetingId}/analysis`).send(analysis);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("DEMO_USER_REQUIRED");
  });

  it("salva revisão e grava meta.reviewed_by", async () => {
    const { app, jobs } = makeApp();
    const meetingId = await createAnalyzedMeeting(app, jobs);
    const analysis = (await request(app).get(`/meetings/${meetingId}/analysis`)).body;
    const res = await request(app)
      .put(`/meetings/${meetingId}/analysis`)
      .set("X-Demo-User", "Marina")
      .send({ ...analysis, summary: "resumo editado" });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe("resumo editado");
    expect(res.body.meta.reviewed_by).toBe("Marina");
    expect(res.body.meta.reviewed_at).toBeTruthy();
  });
});

describe("POST /meetings/:id/analysis/complete-review", () => {
  it("conclui revisão e move meeting para reviewed", async () => {
    const { app, repo, jobs } = makeApp();
    const meetingId = await createAnalyzedMeeting(app, jobs);
    const res = await request(app)
      .post(`/meetings/${meetingId}/analysis/complete-review`)
      .set("X-Demo-User", "Marina")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.review_completed).toBe(true);
    expect((await repo.getMeeting(meetingId))?.status).toBe("reviewed");
  });

  it("409 ANALYSIS_REVIEW_INCOMPLETE com item pendente", async () => {
    const { app, jobs } = makeApp();
    const meetingId = await createAnalyzedMeeting(app, jobs);
    const analysis = (await request(app).get(`/meetings/${meetingId}/analysis`)).body;
    const pendingNeed = {
      id: "cn1",
      confidence: "high",
      source_refs: [],
      review_status: "pending",
      category: "problem",
      description: "precisa de um portal",
    };
    await request(app)
      .put(`/meetings/${meetingId}/analysis`)
      .set("X-Demo-User", "Marina")
      .send({ ...analysis, client_needs: [pendingNeed] });

    const res = await request(app)
      .post(`/meetings/${meetingId}/analysis/complete-review`)
      .set("X-Demo-User", "Marina")
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ANALYSIS_REVIEW_INCOMPLETE");
  });
});
