import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../../../src/repositories/memory.js";
import {
  handleStatusUpdate,
  mapBaileysStatus,
} from "../../../src/integrations/whatsapp/statusListener.js";

describe("mapBaileysStatus", () => {
  it("mapeia DELIVERY_ACK=3 → delivered, READ=4 → read, ERROR=0 → failed", () => {
    expect(mapBaileysStatus(3)).toBe("delivered");
    expect(mapBaileysStatus(4)).toBe("read");
    expect(mapBaileysStatus(0)).toBe("failed");
  });

  it("ignora status sem mapeamento (SERVER_ACK=2, PENDING=1, PLAYED=5, undefined)", () => {
    expect(mapBaileysStatus(2)).toBeNull();
    expect(mapBaileysStatus(1)).toBeNull();
    expect(mapBaileysStatus(5)).toBeNull();
    expect(mapBaileysStatus(undefined)).toBeNull();
    expect(mapBaileysStatus(null)).toBeNull();
  });
});

describe("handleStatusUpdate", () => {
  it("atualiza o canal correlacionado por providerMessageId e grava ChannelEvent", async () => {
    const repo = new MemoryRepository();
    const delivery = await repo.createDelivery({ approvalId: "a", idempotencyKey: "k", authorizedBy: "u" });
    const channel = await repo.createChannel({
      deliveryId: delivery.id,
      channel: "whatsapp",
      recipient: { phone: "+5511999990000" },
    });
    await repo.updateChannel(channel.id, { providerMessageId: "wa-msg-1", status: "sent" });

    await handleStatusUpdate(repo, { id: "wa-msg-1" }, 3);

    const updated = await repo.getChannel(channel.id);
    expect(updated?.status).toBe("delivered");
    expect(updated?.deliveredAt).not.toBeNull();

    const events = await repo.listChannelEvents(channel.id);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("delivered");
  });

  it("não altera canais sem correspondência de providerMessageId", async () => {
    const repo = new MemoryRepository();
    const delivery = await repo.createDelivery({ approvalId: "a", idempotencyKey: "k", authorizedBy: "u" });
    const channel = await repo.createChannel({
      deliveryId: delivery.id,
      channel: "whatsapp",
      recipient: { phone: "+5511999990000" },
    });
    await repo.updateChannel(channel.id, { providerMessageId: "wa-msg-1", status: "sent" });

    await handleStatusUpdate(repo, { id: "outro-id" }, 4);

    const updated = await repo.getChannel(channel.id);
    expect(updated?.status).toBe("sent");
    expect(await repo.listChannelEvents(channel.id)).toHaveLength(0);
  });
});
