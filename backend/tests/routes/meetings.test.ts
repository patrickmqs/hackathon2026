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
  return createApp({ repo, storage });
}

function makeAppWithJobs() {
  const repo = new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "proposal-ai-")));
  const jobs = new JobRunner({ repo, storage, pipeline: new SuccessfulStubPipeline(), staleMinutes: 0 });
  return { app: createApp({ repo, storage, jobs }), jobs };
}

async function createProject(app: ReturnType<typeof makeApp>): Promise<string> {
  const res = await request(app)
    .post("/projects")
    .send({ name: "P", client: { company: "Acme" } });
  return res.body.id as string;
}

describe("POST /projects/:id/meetings (texto)", () => {
  it("cria meeting analyzing e retorna 202", async () => {
    const app = makeApp();
    const projectId = await createProject(app);
    const res = await request(app)
      .post(`/projects/${projectId}/meetings`)
      .send({ transcript_text: "Ana: preciso de um portal", language: "pt-BR" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("analyzing");
    expect(res.body.source_type).toBe("text");
    expect(res.body.progress.step).toBe("analyzing");
    expect(res.body.transcript).toBeNull();
  });

  it("rejeita sem transcript_text com 400", async () => {
    const app = makeApp();
    const projectId = await createProject(app);
    const res = await request(app).post(`/projects/${projectId}/meetings`).send({});
    expect(res.status).toBe(400);
  });

  it("404 se o projeto não existe", async () => {
    const res = await request(makeApp())
      .post("/projects/nao-existe/meetings")
      .send({ transcript_text: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /projects/:id/meetings (áudio)", () => {
  it("aceita áudio válido → transcribing", async () => {
    const app = makeApp();
    const projectId = await createProject(app);
    const res = await request(app)
      .post(`/projects/${projectId}/meetings`)
      .field("title", "Reunião")
      .attach("audio", Buffer.from("fake-audio-bytes"), {
        filename: "a.mp3",
        contentType: "audio/mpeg",
      });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("transcribing");
    expect(res.body.source_type).toBe("audio");
    expect(res.body.title).toBe("Reunião");
  });

  it("rejeita mime inválido → 400 UPLOAD_INVALID", async () => {
    const app = makeApp();
    const projectId = await createProject(app);
    const res = await request(app)
      .post(`/projects/${projectId}/meetings`)
      .attach("audio", Buffer.from("x"), { filename: "a.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UPLOAD_INVALID");
  });
});

describe("GET /meetings/:id", () => {
  it("retorna a reunião criada", async () => {
    const app = makeApp();
    const projectId = await createProject(app);
    const created = await request(app)
      .post(`/projects/${projectId}/meetings`)
      .send({ transcript_text: "texto completo da reunião" });
    const res = await request(app).get(`/meetings/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.project_id).toBe(projectId);
    // status ainda é "analyzing": transcript fica oculto (API_SPEC §4.3).
    expect(res.body.transcript).toBeNull();
  });

  it("404 para reunião inexistente", async () => {
    const res = await request(makeApp()).get("/meetings/nao-existe");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /meetings/:id/reprocess", () => {
  it("reprocessa reunião em analysis_ready (202 → analyzing)", async () => {
    const { app, jobs } = makeAppWithJobs();
    const projectId = await createProject(app);
    const created = await request(app)
      .post(`/projects/${projectId}/meetings`)
      .send({ transcript_text: "reunião" });
    await jobs.drain();

    const res = await request(app).post(`/meetings/${created.body.id}/reprocess`);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("analyzing");
  });

  it("409 para reunião ainda em processamento", async () => {
    // Sem jobs, a reunião permanece "analyzing" (estado não reprocessável).
    const app = makeApp();
    const projectId = await createProject(app);
    const created = await request(app)
      .post(`/projects/${projectId}/meetings`)
      .send({ transcript_text: "reunião" });
    const res = await request(app).post(`/meetings/${created.body.id}/reprocess`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MEETING_NOT_READY");
  });
});
