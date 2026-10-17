import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FileStorage } from "../../../src/core/storage.js";
import { MemoryRepository } from "../../../src/repositories/memory.js";
import type { Repository } from "../../../src/repositories/repo.js";
import type { Channel } from "../../../src/schemas/common.js";
import { DeliveryService } from "../../../src/services/delivery/service.js";
import type {
  ChannelAdapter,
  ChannelSendRequest,
  ProviderResult,
} from "../../../src/services/delivery/types.js";

class FakeAdapter implements ChannelAdapter {
  readonly channel: Channel;
  configured = true;
  result: ProviderResult = { ok: true, providerMessageId: "wa-msg-1", error: null };
  sent: ChannelSendRequest[] = [];

  constructor(channel: Channel = "whatsapp") {
    this.channel = channel;
  }

  async isConfigured(): Promise<boolean> {
    return this.configured;
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

function makeService(overrides: { adapters?: Record<string, ChannelAdapter>; repo?: Repository } = {}) {
  const repo = overrides.repo ?? new MemoryRepository();
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), "delivery-")));
  const resolvePdf = vi.fn(async () => ({ path: "/tmp/fake.pdf", filename: "proposta-v1.pdf" }));
  const service = new DeliveryService({
    repo,
    storage,
    adapters: overrides.adapters ?? {},
    resolvePdf,
  });
  return { repo, service, resolvePdf };
}

describe("DeliveryService.authorizeDelivery", () => {
  it("rejeita sem aprovação aprovada (APPROVAL_REQUIRED)", async () => {
    const { service } = makeService();
    await expect(
      service.authorizeDelivery({
        approvalId: "inexistente",
        idempotencyKey: "k1",
        channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000" } }],
        actor: "u",
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });

  it("rejeita versão superseded (APPROVAL_SUPERSEDED)", async () => {
    const { repo, service } = makeService();
    const { approval, version } = await seedApprovedProposal(repo);
    await repo.updateVersion(version.id, { status: "superseded" });
    await expect(
      service.authorizeDelivery({
        approvalId: approval.id,
        idempotencyKey: "k2",
        channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000" } }],
        actor: "u",
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_SUPERSEDED" });
  });

  it("rejeita destinatário inválido (RECIPIENT_INVALID) sem criar delivery", async () => {
    const { repo, service } = makeService();
    const { approval } = await seedApprovedProposal(repo);
    await expect(
      service.authorizeDelivery({
        approvalId: approval.id,
        idempotencyKey: "k3",
        channels: [{ channel: "whatsapp", recipient: { phone: "abc" } }],
        actor: "u",
      }),
    ).rejects.toMatchObject({ code: "RECIPIENT_INVALID" });
    expect(await repo.getDeliveryByIdempotencyKey("k3")).toBeNull();
  });

  it("canal sem credenciais nasce skipped_no_credentials", async () => {
    const { repo, service } = makeService(); // sem adapters
    const { approval } = await seedApprovedProposal(repo);
    const { delivery, channels } = await service.authorizeDelivery({
      approvalId: approval.id,
      idempotencyKey: "k4",
      channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000" } }],
      actor: "u",
    });
    expect(channels).toHaveLength(1);
    expect(channels[0].status).toBe("skipped_no_credentials");
    expect(channels[0].error).toMatchObject({ code: "CHANNEL_NOT_CONFIGURED" });
    expect(delivery.status).toBe("failed");
  });

  it("é idempotente: mesma chave + mesmo payload devolve o existente", async () => {
    const adapter = new FakeAdapter();
    const { repo, service } = makeService({ adapters: { whatsapp: adapter } });
    const { approval } = await seedApprovedProposal(repo);
    const input = {
      approvalId: approval.id,
      idempotencyKey: "k5",
      channels: [{ channel: "whatsapp" as const, recipient: { phone: "+5511999990000", name: "Ana" } }],
      actor: "u",
    };
    const first = await service.authorizeDelivery(input);
    const second = await service.authorizeDelivery(input);
    expect(second.delivery.id).toBe(first.delivery.id);
    expect(await repo.getDeliveryByIdempotencyKey("k5")).not.toBeNull();
    const all = [...(second.channels.map((c) => c.id)), first.channels.map((c) => c.id)[0]];
    expect(all).toHaveLength(2); // sem criação duplicada de channel
  });

  it("mesma chave com payload diferente → IDEMPOTENCY_CONFLICT", async () => {
    const adapter = new FakeAdapter();
    const { repo, service } = makeService({ adapters: { whatsapp: adapter } });
    const { approval } = await seedApprovedProposal(repo);
    await service.authorizeDelivery({
      approvalId: approval.id,
      idempotencyKey: "k6",
      channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000" } }],
      actor: "u",
    });
    await expect(
      service.authorizeDelivery({
        approvalId: approval.id,
        idempotencyKey: "k6",
        channels: [{ channel: "whatsapp", recipient: { phone: "+5511888880000" } }],
        actor: "u",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});

describe("DeliveryService.dispatchChannel", () => {
  it("envia e marca sent + delivery completed", async () => {
    const adapter = new FakeAdapter();
    const { repo, service } = makeService({ adapters: { whatsapp: adapter } });
    const { approval } = await seedApprovedProposal(repo);
    const { channels } = await service.authorizeDelivery({
      approvalId: approval.id,
      idempotencyKey: "k7",
      channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000", name: "Ana", caption: "Segue a proposta" } }],
      actor: "u",
    });
    const channel = channels[0];
    const result = await service.dispatchChannel(channel.id);
    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("wa-msg-1");
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].bodyText).toBe("Segue a proposta");
    expect(adapter.sent[0].attachmentPath).toBe("/tmp/fake.pdf");

    const delivery = await repo.getDelivery(result.deliveryId);
    expect(delivery?.status).toBe("completed");
  });

  it("falha retryable marca failed e permite retry", async () => {
    const adapter = new FakeAdapter();
    adapter.result = { ok: false, providerMessageId: null, error: { code: "WA_UNAVAILABLE", message: "indisponível", retryable: true } };
    const { repo, service } = makeService({ adapters: { whatsapp: adapter } });
    const { approval } = await seedApprovedProposal(repo);
    const { channels } = await service.authorizeDelivery({
      approvalId: approval.id,
      idempotencyKey: "k8",
      channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000" } }],
      actor: "u",
    });
    const failed = await service.dispatchChannel(channels[0].id);
    expect(failed.status).toBe("failed");
    expect(failed.attempts).toBe(1);

    // recupera e reenvia
    adapter.result = { ok: true, providerMessageId: "wa-msg-2", error: null };
    const retried = await service.retryChannel(channels[0].id);
    expect(retried.status).toBe("sent");
    expect(retried.attempts).toBe(2);
  });

  it("falha não-retryable não permite retry (CHANNEL_NOT_RETRYABLE)", async () => {
    const adapter = new FakeAdapter();
    adapter.result = { ok: false, providerMessageId: null, error: { code: "WA_RECIPIENT_INVALID", message: "número", retryable: false } };
    const { repo, service } = makeService({ adapters: { whatsapp: adapter } });
    const { approval } = await seedApprovedProposal(repo);
    const { channels } = await service.authorizeDelivery({
      approvalId: approval.id,
      idempotencyKey: "k9",
      channels: [{ channel: "whatsapp", recipient: { phone: "+5511999990000" } }],
      actor: "u",
    });
    const failed = await service.dispatchChannel(channels[0].id);
    expect(failed.status).toBe("failed");
    await expect(service.retryChannel(channels[0].id)).rejects.toMatchObject({ code: "CHANNEL_NOT_RETRYABLE" });
  });
});
