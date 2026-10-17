import type { DeliveryChannelRecord, Repository } from "../../repositories/repo.js";
import type { ChannelStatus } from "../../schemas/common.js";

// Listener de status de entrega do Baileys — WHATSAPP_BAILEYS_ROADMAP §5.
// O Baileys emite `messages.update` (eventos do socket), não webhook. Cada item traz
// `{ key, update: { status } }`; o `key.id` é o `provider_message_id` gravado no envio.

// proto.WebMessageInfo.Status: ERROR=0, PENDING=1, SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5.
const BAILAYS_STATUS_TO_CHANNEL: Record<number, ChannelStatus> = {
  0: "failed", // ERROR
  3: "delivered", // DELIVERY_ACK
  4: "read", // READ
};

export function mapBaileysStatus(status: number | undefined | null): ChannelStatus | null {
  if (typeof status !== "number") return null;
  return BAILAYS_STATUS_TO_CHANNEL[status] ?? null;
}

export async function handleStatusUpdate(
  repo: Repository,
  key: { id?: string | null },
  status: number | undefined | null,
): Promise<void> {
  const providerMessageId = key?.id;
  if (!providerMessageId) return;
  const mapped = mapBaileysStatus(status);
  if (!mapped) return;

  const channel = await repo.findChannelByProviderMessageId(providerMessageId);
  if (!channel) return;

  const patch: Partial<DeliveryChannelRecord> = { status: mapped };
  if (mapped === "delivered") patch.deliveredAt = new Date().toISOString();

  await repo.updateChannel(channel.id, patch);
  await repo.createChannelEvent({
    channelId: channel.id,
    type: mapped,
    payload: { provider_status: status, provider_message_id: providerMessageId },
  });
}
