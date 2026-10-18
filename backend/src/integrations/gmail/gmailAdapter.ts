import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { google } from "googleapis";
import { config } from "../../core/config.js";
import { logger } from "../../core/logging.js";
import type { Channel } from "../../schemas/common.js";
import type {
  ChannelAdapter,
  ChannelSendRequest,
  ProviderError,
  ProviderResult,
} from "../../services/delivery/types.js";
import { getAuthorizedClient, getGmailStatus } from "./oauth.js";

// Adapter de envio do Gmail via OAuth 2.0 (Gmail API, escopo gmail.send) — INTEGRATIONS.md §2.
// A camada de delivery não conhece googleapis: ela só vê `ChannelAdapter`.

function encodeHeaderValue(value: string): string {
  // ASCII puro passa direto; caso contrário, RFC 2047 (base64).
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string): string {
  return value.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");
}

function buildRawMime(opts: {
  from: string;
  to: string;
  subject: string;
  text: string;
  filename?: string;
  pdf?: Buffer;
}): string {
  const boundary = `----=_Part_${randomBytes(16).toString("hex")}`;
  const parts: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(opts.text, "utf8").toString("base64")),
  ];
  if (opts.pdf && opts.filename) {
    parts.push(
      `--${boundary}`,
      "Content-Type: application/pdf; name=\"" + encodeHeaderValue(opts.filename) + "\"",
      `Content-Disposition: attachment; filename="${encodeHeaderValue(opts.filename)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(opts.pdf.toString("base64")),
    );
  }
  parts.push(`--${boundary}--`, "");
  return Buffer.from(parts.join("\r\n"), "utf8").toString("base64url");
}

export function mapError(error: unknown): ProviderError {
  const e = error as { code?: number | string; errors?: { reason?: string; message?: string }[] };
  const reason = e?.errors?.[0]?.reason ?? "";
  const googleMessage = e?.errors?.[0]?.message ?? "";
  const status = e?.code;

  // Registra o motivo real do Google (sem segredos) para diagnóstico no log de produção.
  logger.warn("gmail.send falhou", { status, reason, message: googleMessage });

  if (reason === "invalid_grant" || reason === "authError") {
    return {
      code: "GMAIL_AUTH_EXPIRED",
      message: "Autorização do Gmail expirou ou foi revogada. Reconecte em Configurações.",
      retryable: false,
      raw: error,
    };
  }
  if (reason === "accessNotConfigured") {
    return {
      code: "GMAIL_API_DISABLED",
      message: "Gmail API não habilitada no Google Cloud. Habilite a API do Gmail e tente novamente em alguns minutos.",
      retryable: false,
      raw: error,
    };
  }
  if (reason === "insufficientPermissions") {
    return {
      code: "GMAIL_SCOPE_MISSING",
      message: "Permissão de envio não concedida (escopo gmail.send ausente). Reconecte em Configurações.",
      retryable: false,
      raw: error,
    };
  }
  if (reason === "invalidArgument" || status === 400) {
    return {
      code: "GMAIL_RECIPIENT_INVALID",
      message: "Endereço de e-mail recusado pelo Gmail.",
      retryable: false,
      raw: error,
    };
  }
  if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded" || reason === "dailyLimitExceeded" || reason === "quotaExceeded" || status === 429) {
    return {
      code: "GMAIL_RATE_LIMITED",
      message: "Limite temporário do Gmail. Tente novamente em alguns minutos.",
      retryable: true,
      raw: error,
    };
  }
  return {
    code: "GMAIL_SEND_FAILED",
    message: `Falha ao enviar o e-mail pelo Gmail${reason ? ` (${reason})` : ""}${googleMessage ? `: ${googleMessage}` : ""}.`,
    retryable: true,
    raw: error,
  };
}

async function sendMail(to: string, subject: string, text: string, attachment?: Buffer, filename?: string): Promise<ProviderResult> {
  const authorized = await getAuthorizedClient();
  if (!authorized) {
    return {
      ok: false,
      providerMessageId: null,
      error: {
        code: "CHANNEL_NOT_CONFIGURED",
        message: "Gmail não conectado. Conecte em Configurações.",
        retryable: false,
      },
    };
  }

  const raw = buildRawMime({
    from: authorized.accountEmail,
    to,
    subject,
    text,
    pdf: attachment,
    filename,
  });

  const gmail = google.gmail({ version: "v1", auth: authorized.client });
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return { ok: true, providerMessageId: res.data.id ?? null, error: null, raw: res.data };
}

export class GmailOAuthAdapter implements ChannelAdapter {
  readonly channel: Channel = "gmail";

  async isConfigured(): Promise<boolean> {
    const { connected } = await getGmailStatus();
    return connected;
  }

  async send(req: ChannelSendRequest): Promise<ProviderResult> {
    if (config.gmailForceFail) {
      return {
        ok: false,
        providerMessageId: null,
        error: { code: "GMAIL_UNAVAILABLE", message: "Gmail indisponível (falha simulada).", retryable: true },
      };
    }

    const email = req.recipient.email;
    if (!email) {
      return {
        ok: false,
        providerMessageId: null,
        error: { code: "GMAIL_RECIPIENT_INVALID", message: "E-mail do destinatário ausente.", retryable: false },
      };
    }

    try {
      const pdf = readFileSync(req.attachmentPath);
      return await sendMail(email, req.subject ?? "Proposta", req.bodyText ?? "", pdf, req.attachmentFilename);
    } catch (error) {
      return { ok: false, providerMessageId: null, error: mapError(error) };
    }
  }
}

// Envia um e-mail de teste simples (usado pelo botão "Teste" do frontend).
export async function sendTestEmail(
  email: string,
  text: string,
): Promise<{ ok: boolean; providerMessageId: string | null; error: string | null }> {
  if (!(await getGmailStatus()).connected) {
    return { ok: false, providerMessageId: null, error: "Gmail não conectado. Conecte primeiro." };
  }
  try {
    const result = await sendMail(email, "Teste de integração — Proposal AI", text);
    return {
      ok: result.ok,
      providerMessageId: result.providerMessageId,
      error: result.ok ? null : (result.error?.message ?? "Falha ao enviar o e-mail de teste."),
    };
  } catch (error) {
    return { ok: false, providerMessageId: null, error: mapError(error).message };
  }
}
