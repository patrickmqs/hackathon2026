import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { FileStorage } from "../../src/core/storage.js";
import { MemoryRepository } from "../../src/repositories/memory.js";
import type { Repository } from "../../src/repositories/repo.js";
import type { Channel } from "../../src/schemas/common.js";
import { DeliveryService } from "../../src/services/delivery/service.js";
import type {
  ChannelAdapter,
  ChannelSendRequest,
  ProviderResult,
} from "../../src/services/delivery/types.js";

class FakeWhatsAppAdapter implements ChannelAdapter {
  readonly channel: Channel = "whatsapp";
  sent: ChannelSendRequest[] = [];
  result: ProviderResult = { ok: true, providerMessageId: "wa-msg-1", error: null };

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async send(req: ChannelSendRequest): Promise<ProviderResult> {
    this.sent.push(req);
    return this.result;
  }
}

async function seedApprovedProposal(repo: Repository) {
  const project = await repo.createProject({ name: "Portal B2B", description: null, client: { company: "Acme" } });
  const proposal = await repo.createProposal({ projectId: project.id, meetingId: null });
  const version = await repo.createVersion({
    proposalId: proposal.id,
    number: 1,
    content: { title: "Proposta Portal B2B" },
    contentHash: "hash-1",
    createdBy: "Marina",
  });
  await repo.updateVersion(version.id, { status: "approved" });
  await repo.updateProposal(proposal.id, { currentVersion: 1, approvedVersion: 1, status: "approved" });
  const approval = await repo.createApproval({
    proposalVersionId: version.id,
    approvedBy: "Rafael",
    contentHash: "hash-1",
    note: null,
  });
  return { project, proposal, version, approval };
}

function makeApp(adapter: ChannelAdapter) {
  const repo = new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "delivery-route-")));
  // resolvePdf fake: evita depender do Playwright (geração real de PDF) nos testes.
  const deliveryService = new DeliveryService({
    repo,
    storage,
    adapters: { whatsapp: adapter },
    resolvePdf: async () => ({ path: "/tmp/fake.pdf", filename: "proposta-v1.pdf" }),
  });
  const app = createApp({ repo, storage, adapters: { whatsapp: adapter }, deliveryService });
  return { repo, app };
}

async function waitForDelivery(app: ReturnType<typeof makeApp>["app"], deliveryId: string, timeoutMs = 3000) {
  const start = Date.now();
  let body: Record<string, unknown> = {};
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get(`/deliveries/${deliveryId}`);
    body = res.body;
    if (body.status !== "in_progress") return body;
    await new Promise((r) => setTimeout(r, 20));
  }
  return body;
}

describe("rotas de envio (POST /deliveries)", () => {
  it("fluxo completo: aprova → 202 → canal sent → delivery completed", async () => {
    const adapter = new FakeWhatsAppAdapter();
    const { repo, app } = makeApp(adapter);
    const { approval } = await seedApprovedProposal(repo);

    const res = await request(app)
      .post("/deliveries")
      .set("X-Demo-User", "Rafael")
      .send({
        approval_id: approval.id,
        idempotency_key: "k-flow",
        channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000", name: "Ana" }, options: { caption: "Segue a proposta" } }],
      });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("in_progress");
    const deliveryId = res.body.id as string;

    const final = await waitForDelivery(app, deliveryId);
    expect(final.status).toBe("completed");
    expect(final.channels[0].status).toBe("sent");
    expect(final.channels[0].provider_message_id).toBe("wa-msg-1");
    expect(adapter.sent).toHaveLength(1);
  });

  it("não envia sem approval_id aprovado (APPROVAL_REQUIRED)", async () => {
    const adapter = new FakeWhatsAppAdapter();
    const { repo, app } = makeApp(adapter);
    // versão ainda em draft (não aprovada), mas com um Approval criado artificialmente
    const project = await repo.createProject({ name: "P", description: null, client: {} });
    const proposal = await repo.createProposal({ projectId: project.id, meetingId: null });
    const version = await repo.createVersion({
      proposalId: proposal.id,
      number: 1,
      content: { title: "P" },
      contentHash: "h",
      createdBy: "u",
    });
    const approval = await repo.createApproval({ proposalVersionId: version.id, approvedBy: "u", contentHash: "h", note: null });

    const res = await request(app)
      .post("/deliveries")
      .set("X-Demo-User", "Rafael")
      .send({
        approval_id: approval.id,
        idempotency_key: "k-draft",
        channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000" } }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("APPROVAL_REQUIRED");
    expect(adapter.sent).toHaveLength(0);
  });

  it("replay idempotente devolve 200 e não duplica envio", async () => {
    const adapter = new FakeWhatsAppAdapter();
    const { repo, app } = makeApp(adapter);
    const { approval } = await seedApprovedProposal(repo);
    const payload = {
      approval_id: approval.id,
      idempotency_key: "k-idem",
      channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000" } }],
    };

    const first = await request(app).post("/deliveries").set("X-Demo-User", "u").send(payload);
    expect(first.status).toBe(202);
    await waitForDelivery(app, first.body.id);

    const replay = await request(app).post("/deliveries").set("X-Demo-User", "u").send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(adapter.sent).toHaveLength(1);
  });
});
