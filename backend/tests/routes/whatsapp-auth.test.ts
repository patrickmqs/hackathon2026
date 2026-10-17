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
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "wa-auth-")));
  return createApp({ repo, storage });
}

describe("auth do WhatsApp (sem socket conectado)", () => {
  it("GET /auth/whatsapp/status responde não conectado", async () => {
    const app = makeApp();
    const res = await request(app).get("/auth/whatsapp/status");
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  it("POST /auth/whatsapp/test valida o telefone (400)", async () => {
    const app = makeApp();
    const res = await request(app).post("/auth/whatsapp/test").send({ phone: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /auth/whatsapp/test responde ok:false quando desconectado", async () => {
    const app = makeApp();
    const res = await request(app).post("/auth/whatsapp/test").send({ phone: "+5511999990000" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeTruthy();
  });
});
