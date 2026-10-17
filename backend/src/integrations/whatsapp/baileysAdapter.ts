import { readFileSync } from "node:fs";
import { config } from "../../core/config.js";
import type { Channel } from "../../schemas/common.js";
import type {
  ChannelAdapter,
  ChannelSendRequest,
  ProviderResult,
} from "../../services/delivery/types.js";
import { getSocket, getSocketStatus } from "./socket.js";

// Adapter de envio do WhatsApp via Baileys — INTEGRATIONS.md §1 / ROADMAP §4.
// A camada de delivery não conhece Baileys: ela só vê `ChannelAdapter`.

function toJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export class BaileysWhatsAppAdapter implements ChannelAdapter {
  readonly channel: Channel = "whatsapp";

  async isConfigured(): Promise<boolean> {
    return getSocketStatus().connected;
  }

  async send(req: ChannelSendRequest): Promise<ProviderResult> {
    if (config.whatsappForceFail) {
      return {
        ok: false,
        providerMessageId: null,
        error: {
          code: "WA_UNAVAILABLE",
          message: "WhatsApp indisponível (falha simulada).",
          retryable: true,
        },
      };
    }

    const sock = getSocket();
    if (!sock || !getSocketStatus().connected) {
      return {
        ok: false,
        providerMessageId: null,
        error: { code: "CHANNEL_NOT_CONFIGURED", message: "WhatsApp não conectado.", retryable: false },
      };
    }

    const phone = req.recipient.phone;
    if (!phone) {
      return {
        ok: false,
        providerMessageId: null,
        error: { code: "WA_RECIPIENT_INVALID", message: "Telefone do destinatário ausente.", retryable: false },
      };
    }

    try {
      const document = readFileSync(req.attachmentPath);
      const sent = await sock.sendMessage(toJid(phone), {
        document,
        mimetype: "application/pdf",
        fileName: req.attachmentFilename,
        caption: req.bodyText ?? undefined,
      });
      return { ok: true, providerMessageId: sent?.key?.id ?? null, error: null, raw: sent };
    } catch (error) {
      return {
        ok: false,
        providerMessageId: null,
        error: {
          code: "WA_SEND_FAILED",
          message: "Falha ao enviar o PDF pelo WhatsApp.",
          retryable: true,
          raw: error,
        },
      };
    }
  }
}
