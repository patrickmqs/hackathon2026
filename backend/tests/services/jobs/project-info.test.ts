import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { FileStorage } from "../../../src/core/storage.js";
import { MemoryRepository } from "../../../src/repositories/memory.js";
import { PLACEHOLDER_COMPANY, PLACEHOLDER_PROJECT_NAME } from "../../../src/schemas/project.js";
import type { ProjectInfo } from "../../../src/services/aiAnalysis/projectInfo.js";
import { StubAiPipeline } from "../../../src/services/ai/stub.js";
import { JobRunner } from "../../../src/services/jobs/runner.js";

const makeStorage = () => new FileStorage(mkdtempSync(join(tmpdir(), "proposal-ai-")));

class InfoPipeline extends StubAiPipeline {
  constructor(private readonly result: ProjectInfo | null | Error) {
    super();
  }
  async extractProjectInfo(): Promise<ProjectInfo | null> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

async function runWith(
  pipeline: StubAiPipeline,
  project: { name: string; client: Record<string, unknown> },
) {
  const repo = new MemoryRepository();
  const jobs = new JobRunner({ repo, storage: makeStorage(), pipeline });
  const p = await repo.createProject({ name: project.name, description: null, client: project.client });
  const m = await repo.createMeeting({ projectId: p.id, sourceType: "text", status: "analyzing", title: null, audioPath: null });
  await repo.createTranscript({ meetingId: m.id, text: "conversa", segments: [], metadata: {} });
  await jobs.run(m.id);
  return { repo, project: (await repo.getProject(p.id))!, meeting: (await repo.getMeeting(m.id))! };
}

const info: ProjectInfo = {
  project_name: "Portal de pedidos B2B",
  client_company: "Distribuidora Horizonte",
  contact_name: "Ana Souza",
  contact_email: null,
  contact_phone: null,
};
const placeholder = { name: PLACEHOLDER_PROJECT_NAME, client: { company: PLACEHOLDER_COMPANY } };

describe("preenchimento do projeto pela IA", () => {
  it("troca nome e empresa provisórios pelo que a IA achou", async () => {
    const { project, meeting } = await runWith(new InfoPipeline(info), placeholder);
    expect(meeting.status).toBe("analysis_ready");
    expect(project.name).toBe("Portal de pedidos B2B");
    expect(project.client).toMatchObject({ company: "Distribuidora Horizonte", contact_name: "Ana Souza" });
  });

  it("mantém os provisórios quando a IA não achou nada", async () => {
    const empty: ProjectInfo = { project_name: null, client_company: null, contact_name: null, contact_email: null, contact_phone: null };
    const { project } = await runWith(new InfoPipeline(empty), placeholder);
    expect(project.name).toBe(PLACEHOLDER_PROJECT_NAME);
    expect(project.client.company).toBe(PLACEHOLDER_COMPANY);
  });

  it("não sobrescreve nome e empresa já informados pelo usuário", async () => {
    const { project } = await runWith(new InfoPipeline(info), { name: "Meu projeto", client: { company: "Minha Empresa" } });
    expect(project.name).toBe("Meu projeto");
    expect(project.client.company).toBe("Minha Empresa");
  });

  it("falha na extração não derruba a análise", async () => {
    const { meeting, project } = await runWith(new InfoPipeline(new Error("boom")), placeholder);
    expect(meeting.status).toBe("analysis_ready");
    expect(project.name).toBe(PLACEHOLDER_PROJECT_NAME);
  });
});

describe("projeto sem dados e preenchimento posterior", () => {
  const makeApp = () => createApp({ repo: new MemoryRepository(), storage: makeStorage() });

  it("POST /projects sem corpo cria projeto provisório", async () => {
    const res = await request(makeApp()).post("/projects").send({});
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(PLACEHOLDER_PROJECT_NAME);
    expect(res.body.client.company).toBe(PLACEHOLDER_COMPANY);
  });

  it("PATCH /projects/:id completa nome e empresa preservando o resto", async () => {
    const app = makeApp();
    const created = await request(app).post("/projects").send({});
    const res = await request(app)
      .patch(`/projects/${created.body.id}`)
      .send({ name: "Portal B2B", client: { company: "Acme" } });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Portal B2B");
    expect(res.body.client.company).toBe("Acme");
  });

  it("PATCH rejeita nome vazio e 404 para projeto inexistente", async () => {
    const app = makeApp();
    const created = await request(app).post("/projects").send({});
    expect((await request(app).patch(`/projects/${created.body.id}`).send({ name: "" })).status).toBe(400);
    expect((await request(app).patch("/projects/nao-existe").send({ name: "X" })).status).toBe(404);
  });
});
