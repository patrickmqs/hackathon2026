import { Router } from "express";
import { config } from "../core/config.js";

// GET /health — API_SPEC §4.1. Canais ainda não têm integração (B11+), então
// reportam "not_configured" até existir credencial OAuth/WhatsApp.
export function healthRouter(): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      db: "ok",
      ai_configured: config.aiConfigured,
      channels: { gmail: "not_configured", whatsapp: "not_configured" },
    });
  });
  return router;
}
