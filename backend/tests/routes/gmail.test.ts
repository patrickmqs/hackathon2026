import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { FileStorage } from "../../src/core/storage.js";
import { GmailOAuthAdapter, mapError } from "../../src/integrations/gmail/gmailAdapter.js";
import { MemoryRepository } from "../../src/repositories/memory.js";

function makeApp() {
  const repo = new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "gmail-oauth-")));
  return createApp({ repo, storage });
}

describe("auth do Gmail (OAuth, sem credenciais)", () => {
  it("GET /auth/gmail/status responde não configurado", async () => {
    const app = makeApp();
    const res = await request(app).get("/auth/gmail/status");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.connected).toBe(false);
    expect(res.body.mode).toBe("oauth");
    expect(res.body.account_email).toBeNull();
  });

  it("GET /auth/gmail/start responde 400 sem credenciais Google", async () => {
    const app = makeApp();
    const res = await request(app).get("/auth/gmail/start");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /auth/gmail/test valida o e-mail (400)", async () => {
    const app = makeApp();
    const res = await request(app).post("/auth/gmail/test").send({ email: "nao-e-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /auth/gmail/test responde ok:false quando desconectado", async () => {
    const app = makeApp();
    const res = await request(app).post("/auth/gmail/test").send({ email: "cliente@exemplo.com" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeTruthy();
  });
});

describe("GmailOAuthAdapter", () => {
  it("isConfigured() é falso sem credenciais no ambiente de teste", async () => {
    const adapter = new GmailOAuthAdapter();
    expect(adapter.channel).toBe("gmail");
    expect(await adapter.isConfigured()).toBe(false);
  });

  it("send() sem e-mail devolve GMAIL_RECIPIENT_INVALID", async () => {
    const adapter = new GmailOAuthAdapter();
    const result = await adapter.send({
      recipient: {},
      subject: null,
      bodyText: null,
      attachmentPath: "",
      attachmentFilename: "",
      publicPdfUrl: null,
      metadata: { deliveryId: "d", channelId: "c", proposalVersion: 1 },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("GMAIL_RECIPIENT_INVALID");
  });
});

describe("mapError", () => {
  it("distingue Gmail API desabilitada (accessNotConfigured) de escopo ausente", () => {
    const apiDisabled = mapError({
      code: 403,
      errors: [{ reason: "accessNotConfigured", message: "Gmail API ... is disabled." }],
    });
    expect(apiDisabled.code).toBe("GMAIL_API_DISABLED");

    const scopeMissing = mapError({ code: 403, errors: [{ reason: "insufficientPermissions" }] });
    expect(scopeMissing.code).toBe("GMAIL_SCOPE_MISSING");
  });

  it("não rotula todo 403 como escopo ausente", () => {
    const quota = mapError({ code: 403, errors: [{ reason: "dailyLimitExceeded" }] });
    expect(quota.code).toBe("GMAIL_RATE_LIMITED");
  });
});
