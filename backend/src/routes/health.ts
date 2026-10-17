import { Router } from "express";
import { config } from "../core/config.js";
import { getSocketStatus } from "../integrations/whatsapp/socket.js";

// GET /health — API_SPEC §4.1. O WhatsApp reflete o estado real do socket Baileys;
// o Gmail segue "not_configured" até existir o adapter OAuth.
export function healthRouter(): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    const whatsapp = getSocketStatus();
    const whatsappStatus = whatsapp.connected
      ? "connected"
      : whatsapp.configured
        ? "configured"
        : "not_configured";
    res.json({
      status: "ok",
      db: "ok",
      ai_configured: config.aiConfigured,
      channels: { gmail: "not_configured", whatsapp: whatsappStatus },
    });
  });
  return router;
}
