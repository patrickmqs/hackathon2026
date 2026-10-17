import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { FileStorage } from "../../src/core/storage.js";
import { MemoryRepository } from "../../src/repositories/memory.js";

function makeApp() {
  const repo = new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "proposal-ai-")));
  return createApp({ repo, storage });
}

const validProject = {
  name: "Portal B2B",
  description: "Plataforma de pedidos",
  client: { company: "Acme", contact_name: "Ana" },
};

describe("POST /projects", () => {
  it("cria projeto e retorna 201 com status no_meeting", async () => {
    const res = await request(makeApp()).post("/projects").send(validProject);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Portal B2B");
    expect(res.body.status).toBe("no_meeting");
    expect(res.body.latest_meeting_id).toBeNull();
    expect(res.body.latest_proposal_id).toBeNull();
    expect(res.body.created_at).toBeTruthy();
  });

  it("rejeita corpo inválido com 400 VALIDATION_ERROR", async () => {
    const res = await request(makeApp()).post("/projects").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /projects", () => {
  it("lista projetos com paginação", async () => {
    const app = makeApp();
    await request(app).post("/projects").send(validProject);
    const res = await request(app).get("/projects");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
  });
});

describe("GET /projects/:id", () => {
  it("retorna projeto existente", async () => {
    const app = makeApp();
    const created = await request(app).post("/projects").send(validProject);
    const res = await request(app).get(`/projects/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("404 para projeto inexistente", async () => {
    const res = await request(makeApp()).get("/projects/nao-existe");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
