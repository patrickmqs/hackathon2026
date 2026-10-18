import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { config } from "../../core/config.js";
import { logger } from "../../core/logging.js";
import type { Repository } from "../../repositories/repo.js";

// Gerenciamento do OAuth 2.0 do Gmail — INTEGRATIONS.md §2.
// Troca code→tokens, persiste em `OAuthCredential` (provider="google") e expõe um
// client autorizado (com refresh automático pelo google-auth-library).

const PROVIDER = "google";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
];

// `state` CSRF em memória (com expiração). Suficiente para o fluxo local/demo.
const pendingStates = new Map<string, number>();

let repo: Repository | null = null;

type OAuth2Client = ReturnType<typeof createOAuthClient>;

function createOAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  return new google.auth.OAuth2(config.googleClientId, config.googleClientSecret, config.googleRedirectUri);
}

export function initGmailOAuth(store: Repository): void {
  repo = store;
}

export function gmailOAuthConfigured(): boolean {
  return config.googleOAuthConfigured;
}

export function buildAuthUrl(): string {
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return createOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

function consumeState(state: string | undefined): boolean {
  if (!state) return false;
  const expires = pendingStates.get(state);
  pendingStates.delete(state);
  return typeof expires === "number" && expires > Date.now();
}

function decodeEmail(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

export class GmailSendScopeMissingError extends Error {
  constructor(readonly grantedScope: string) {
    super("A conta Google não concedeu a permissão de envio (gmail.send).");
    this.name = "GmailSendScopeMissingError";
  }
}

export async function handleCallback(code: string, state: string | undefined): Promise<{ accountEmail: string }> {
  if (!gmailOAuthConfigured()) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados no backend.");
  }
  if (!consumeState(state)) {
    throw new Error("Parâmetro state inválido ou expirado.");
  }
  if (!repo) throw new Error("Repositório não inicializado.");

  const oauth = createOAuthClient();
  const { tokens } = await oauth.getToken(code);
  const accountEmail = decodeEmail(tokens.id_token);
  if (!accountEmail) {
    throw new Error("Não foi possível identificar o e-mail da conta Google (adicione os escopos openid/email).");
  }

  // O envio depende do escopo restrito gmail.send. Se o Google não o concedeu
  // (app não verificado / fora de "Testing" / conta fora de Test users), não
  // persiste a conexão para evitar uma "conexão falsa" que só falha no envio.
  const grantedScope = typeof tokens.scope === "string" ? tokens.scope : "";
  if (!grantedScope.includes("gmail.send")) {
    throw new GmailSendScopeMissingError(grantedScope);
  }

  await repo.upsertOAuthCredential(PROVIDER, accountEmail, {
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    expiry_date: tokens.expiry_date ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.token_type ?? null,
  });

  logger.info("gmail conectado (OAuth)", { email: accountEmail });
  return { accountEmail };
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scope: string | null;
}

export async function getGmailStatus(): Promise<GmailStatus> {
  if (!gmailOAuthConfigured()) return { configured: false, connected: false, accountEmail: null, scope: null };
  if (!repo) return { configured: true, connected: false, accountEmail: null, scope: null };
  const cred = await repo.getOAuthCredential(PROVIDER);
  return {
    configured: true,
    connected: Boolean(cred),
    accountEmail: cred?.accountEmail ?? null,
    scope: typeof cred?.token?.scope === "string" ? (cred.token.scope as string) : null,
  };
}

export async function getAuthorizedClient(): Promise<{ client: OAuth2Client; accountEmail: string } | null> {
  if (!gmailOAuthConfigured() || !repo) return null;
  const cred = await repo.getOAuthCredential(PROVIDER);
  if (!cred) return null;
  const client = createOAuthClient();
  client.setCredentials(cred.token as Parameters<OAuth2Client["setCredentials"]>[0]);
  return { client, accountEmail: cred.accountEmail };
}

export async function disconnectGmail(): Promise<void> {
  if (!repo) return;
  const cred = await repo.getOAuthCredential(PROVIDER);
  if (cred?.token?.access_token) {
    try {
      const client = createOAuthClient();
      await client.revokeToken(String(cred.token.access_token));
    } catch {
      // Revogação é melhor esforço; o registro local é removido de qualquer forma.
    }
  }
  await repo.deleteOAuthCredential(PROVIDER);
  logger.info("gmail desconectado (OAuth)");
}
