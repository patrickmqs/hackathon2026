import { Router } from "express";
import { z } from "zod";
import { DomainError } from "../core/errors.js";
import { config } from "../core/config.js";
import { parseBody } from "../core/http.js";
import {
  getSocketStatus,
  requestPairingCode,
  resetSession,
  sendTextMessage,
} from "../integrations/whatsapp/socket.js";

const TestMessageSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Telefone em E.164 (ex. +5511999990000)"),
});

// Endpoints de pareamento do WhatsApp (Baileys) — WHATSAPP_BAILEYS_ROADMAP §4.3.
// Substituem o OAuth da Meta: o frontend lê o QR/pairing code e o status da conexão.

export function whatsappAuthRouter(): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    const s = getSocketStatus();
    res.json({
      configured: s.configured,
      connected: s.connected,
      qr: s.qr,
      pairing_code: s.pairingCode,
      phone_number: s.phoneNumber,
    });
  });

  router.get("/qr", async (req, res) => {
    if (config.whatsappPairingCodeMode) {
      const phone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
      if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
        throw new DomainError("VALIDATION_ERROR", "Informe ?phone= em E.164 para gerar o pairing code.");
      }
      const code = await requestPairingCode(phone);
      res.json({ pairing_code: code });
      return;
    }
    const s = getSocketStatus();
    res.json({ qr: s.qr });
  });

  router.delete("/", async (_req, res) => {
    await resetSession();
    res.json({ ok: true });
  });

  // Teste manual de integração: envia "oi" para o número informado.
  router.post("/test", async (req, res) => {
    const input = parseBody(TestMessageSchema, req.body);
    const result = await sendTextMessage(input.phone, "oi 👋");
    res.json({
      ok: result.ok,
      provider_message_id: result.providerMessageId,
      error: result.error,
    });
  });

  return router;
}
