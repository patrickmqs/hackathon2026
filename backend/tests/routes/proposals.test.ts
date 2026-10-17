import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { FileStorage } from "../../src/core/storage.js";
import { MemoryRepository } from "../../src/repositories/memory.js";
import { StubAiPipeline } from "../../src/services/ai/stub.js";
import { JobRunner } from "../../src/services/jobs/runner.js";

function makeApp() {
  const repo = new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "proposal-ai-")));
  const jobs = new JobRunner({ repo, storage, pipeline: new StubAiPipeline(), staleMinutes: 0 });
  const app = createApp({ repo, storage, jobs });
  return { app, jobs };
}

async function createReviewedMeeting(app: ReturnType<typeof makeApp>["app"], jobs: JobRunner) {
  const project = (
    await request(app).post("/projects").send({ name: "Portal B2B", client: { company: "Acme" } })
  ).body;
  const meeting = (
    await request(app)
      .post(`/projects/${project.id}/meetings`)
      .send({ transcript_text: "reunião de descoberta" })
  ).body;
  await jobs.drain();
  await request(app)
    .post(`/meetings/${meeting.id}/analysis/complete-review`)
    .set("X-Demo-User", "Marina")
    .send({});
  return { projectId: project.id, meetingId: meeting.id };
}

describe("propostas e aprovação", () => {
  it("rejeita criar proposta sem revisão concluída", async () => {
    const { app, jobs } = makeApp();
    const project = (await request(app).post("/projects").send({ name: "P", client: { company: "Acme" } })).body;
    const meeting = (
      await request(app).post(`/projects/${project.id}/meetings`).send({ transcript_text: "x" })
    ).body;
    await jobs.drain();
    const res = await request(app)
      .post(`/projects/${project.id}/proposals`)
      .set("X-Demo-User", "Marina")
      .send({ meeting_id: meeting.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ANALYSIS_REVIEW_INCOMPLETE");
  });

  it("fluxo completo: cria, lê versão, aprova e registra eventos", async () => {
    const { app, jobs } = makeApp();
    const { projectId, meetingId } = await createReviewedMeeting(app, jobs);

    // cria proposta
    const created = await request(app)
      .post(`/projects/${projectId}/proposals`)
      .set("X-Demo-User", "Marina")
      .send({ meeting_id: meetingId });
    expect(created.status).toBe(201);
    expect(created.body.current_version).toBe(1);
    expect(created.body.versions).toHaveLength(1);
    const proposalId = created.body.id as string;

    // lê a proposta (resumo, sem content)
    const summary = await request(app).get(`/proposals/${proposalId}`);
    expect(summary.status).toBe(200);
    expect(summary.body.versions[0].number).toBe(1);

    // lê a versão completa (com content + hash)
    const version = await request(app).get(`/proposals/${proposalId}/versions/1`);
    expect(version.status).toBe(200);
    expect(version.body.content.title).toBe("Portal B2B");
    const hash = version.body.content_hash as string;

    // aprova com hash errado → 409
    const wrong = await request(app)
      .post(`/proposals/${proposalId}/versions/1/approve`)
      .set("X-Demo-User", "Rafael")
      .send({ content_hash: "sha256:deadbeef" });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe("PROPOSAL_HASH_MISMATCH");

    // aprova com hash correto → 201
    const approved = await request(app)
      .post(`/proposals/${proposalId}/versions/1/approve`)
      .set("X-Demo-User", "Rafael")
      .send({ content_hash: hash, note: "OK" });
    expect(approved.status).toBe(201);
    expect(approved.body.approved_by).toBe("Rafael");

    // versão agora aprovada
    const after = await request(app).get(`/proposals/${proposalId}/versions/1`);
    expect(after.body.status).toBe("approved");
    expect(after.body.approval.approved_by).toBe("Rafael");

    // timeline registra os eventos do fluxo
    const events = await request(app).get(`/projects/${projectId}/events`);
    expect(events.status).toBe(200);
    const types = events.body.items.map((e: { type: string }) => e.type);
    expect(types).toContain("project.created");
    expect(types).toContain("meeting.created");
    expect(types).toContain("analysis.ready");
    expect(types).toContain("analysis.reviewed");
    expect(types).toContain("proposal.version_created");
    expect(types).toContain("proposal.approved");
  });

  it("cria nova versão com número incrementado", async () => {
    const { app, jobs } = makeApp();
    const { projectId, meetingId } = await createReviewedMeeting(app, jobs);
    const created = await request(app)
      .post(`/projects/${projectId}/proposals`)
      .set("X-Demo-User", "Marina")
      .send({ meeting_id: meetingId });
    const proposalId = created.body.id as string;
    const v1 = await request(app).get(`/proposals/${proposalId}/versions/1`);
    const res = await request(app)
      .post(`/proposals/${proposalId}/versions`)
      .set("X-Demo-User", "Marina")
      .send({ base_version: 1, content: v1.body.content });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe(2);
    expect(res.body.status).toBe("draft");
  });
});
