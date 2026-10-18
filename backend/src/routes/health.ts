import { Router } from "express";
import { config } from "../core/config.js";
import { getGmailStatus } from "../integrations/gmail/oauth.js";
import { getSocketStatus } from "../integrations/whatsapp/socket.js";

// GET /health — API_SPEC §4.1. O WhatsApp reflete o estado real do socket Baileys;
// o Gmail reflete o estado real do OAuth (conectado/configured/não configurado).
export function healthRouter(): Router {
  const router = Router();
  router.get("/health", async (_req, res) => {
    const whatsapp = getSocketStatus();
    const whatsappStatus = whatsapp.connected
      ? "connected"
      : whatsapp.configured
        ? "configured"
        : "not_configured";
    const gmail = await getGmailStatus();
    const gmailStatus = gmail.connected ? "connected" : gmail.configured ? "configured" : "not_configured";
    res.json({
      status: "ok",
      db: "ok",
      ai_configured: config.aiConfigured,
      channels: { gmail: gmailStatus, whatsapp: whatsappStatus },
    });
  });
  return router;
}
