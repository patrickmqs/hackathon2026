import { Router } from "express";
import { z } from "zod";
import { config } from "../core/config.js";
import { parseBody } from "../core/http.js";
import { sendTestEmail } from "../integrations/gmail/gmailAdapter.js";
import {
  buildAuthUrl,
  disconnectGmail,
  getGmailStatus,
  gmailOAuthConfigured,
  handleCallback,
} from "../integrations/gmail/oauth.js";

const TestEmailSchema = z.object({
  email: z.string().email("E-mail inválido"),
});

// Endpoints do Gmail (OAuth 2.0) — INTEGRATIONS.md §2.1.
// GET /start        → redireciona para o consentimento do Google
// GET /callback     → troca code por tokens e persiste em OAuthCredential
// GET /status       → estado atual (configured/connected/account_email)
// DELETE /          → revoga e desconecta
// POST /test        → envia um e-mail de teste

export function gmailAuthRouter(): Router {
  const router = Router();

  router.get("/status", async (_req, res) => {
    const s = await getGmailStatus();
    res.json({
      configured: s.configured,
      connected: s.connected,
      account_email: s.accountEmail,
      mode: "oauth",
    });
  });

  router.get("/start", (_req, res) => {
    if (!gmailOAuthConfigured()) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados no backend.",
          details: null,
          request_id: res.locals.requestId ?? null,
        },
      });
      return;
    }
    res.redirect(buildAuthUrl());
  });

  router.get("/callback", async (req, res) => {
    const errorUrl = `${config.frontendUrl}/settings?gmail=error`;
    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : undefined;
      if (!code) {
        res.redirect(errorUrl);
        return;
      }
      await handleCallback(code, state);
      res.redirect(`${config.frontendUrl}/settings?gmail=connected`);
    } catch {
      res.redirect(errorUrl);
    }
  });

  router.delete("/", async (_req, res) => {
    await disconnectGmail();
    res.json({ ok: true });
  });

  // Teste manual de integração: envia "oi" para o e-mail informado.
  router.post("/test", async (req, res) => {
    const input = parseBody(TestEmailSchema, req.body);
    const result = await sendTestEmail(input.email, "oi 👋 — este é um teste de envio do Proposal AI.");
    res.json({
      ok: result.ok,
      provider_message_id: result.providerMessageId,
      error: result.error,
    });
  });

  return router;
}
