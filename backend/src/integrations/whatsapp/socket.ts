import { mkdirSync, rmSync } from "node:fs";
import {
  DisconnectReason,
  makeWASocket,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { config } from "../../core/config.js";
import { logger } from "../../core/logging.js";
import type { Repository } from "../../repositories/repo.js";
import { handleStatusUpdate } from "./statusListener.js";

// Socket singleton do WhatsApp (Baileys) — WHATSAPP_BAILEYS_ROADMAP §3/§4.
// Um único `WASocket` por processo, criado no boot (ou lazy no primeiro uso),
// com reconexão automática e sessão persistida em `{WHATSAPP_SESSION_DIR}`.

export type WhatsappConnectionState = "uninitialized" | "connecting" | "open" | "closed";

export interface WhatsappSocketStatus {
  configured: boolean;
  connected: boolean;
  state: WhatsappConnectionState;
  qr: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
}

let socket: WASocket | null = null;
let saveCreds: (() => Promise<void>) | null = null;
let repo: Repository | null = null;
let connectionState: WhatsappConnectionState = "uninitialized";
let hasSession = false;
let latestQr: string | null = null;
let latestPairingCode: string | null = null;
let phoneNumber: string | null = null;
let startPromise: Promise<void> | null = null;
let shouldReconnect = true;

export function getSocket(): WASocket | null {
  return socket;
}

export function getSocketStatus(): WhatsappSocketStatus {
  return {
    configured: hasSession || connectionState === "open",
    connected: connectionState === "open",
    state: connectionState,
    qr: latestQr,
    pairingCode: latestPairingCode,
    phoneNumber,
  };
}

export function startSocket(store: Repository): Promise<void> {
  repo = store;
  if (startPromise) return startPromise;
  startPromise = connect().finally(() => {
    startPromise = null;
  });
  return startPromise;
}

async function connect(): Promise<void> {
  if (connectionState === "open") return;

  const sessionDir = config.whatsappSessionDir;
  mkdirSync(sessionDir, { recursive: true });
  const { state, saveCreds: save } = await useMultiFileAuthState(sessionDir);
  saveCreds = save;
  hasSession = Boolean(state.creds.registered);

  connectionState = "connecting";
  const sock = makeWASocket({ auth: state });
  socket = sock;

  sock.ev.on("creds.update", async (creds) => {
    hasSession = Boolean(creds.registered);
    await saveCreds?.();
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQr = qr;
      latestPairingCode = null;
    }
    if (connection === "open") {
      connectionState = "open";
      latestQr = null;
      latestPairingCode = null;
      phoneNumber = extractPhoneNumber(sock.user?.id);
      logger.info("whatsapp conectado", { phone: phoneNumber });
      return;
    }
    if (connection === "close") {
      connectionState = "closed";
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        hasSession = false;
        logger.warn("whatsapp sessão desconectada (logged out)");
        return;
      }
      // Reconexão automática (com atraso para evitar loop apertado).
      setTimeout(() => {
        if (shouldReconnect && connectionState === "closed" && statusCode !== DisconnectReason.loggedOut && repo) {
          void startSocket(repo);
        }
      }, 3000).unref?.();
    }
  });

  sock.ev.on("messages.update", (updates) => {
    if (!repo) return;
    for (const { key, update } of updates) {
      void handleStatusUpdate(repo, key, update.status);
    }
  });
}

export async function requestPairingCode(phone: string): Promise<string | null> {
  if (!socket) return null;
  latestPairingCode = await socket.requestPairingCode(phone);
  return latestPairingCode;
}

// Envia uma mensagem de texto simples (usado pelo botão "Teste" do frontend).
export async function sendTextMessage(
  phone: string,
  text: string,
): Promise<{ ok: boolean; providerMessageId: string | null; error: string | null }> {
  if (!socket || connectionState !== "open") {
    return { ok: false, providerMessageId: null, error: "WhatsApp não conectado. Conecte primeiro." };
  }
  try {
    const digits = phone.replace(/\D/g, "");
    const sent = await socket.sendMessage(`${digits}@s.whatsapp.net`, { text });
    return { ok: true, providerMessageId: sent?.key?.id ?? null, error: null };
  } catch {
    return { ok: false, providerMessageId: null, error: "Falha ao enviar a mensagem de teste." };
  }
}

export async function disconnectSocket(): Promise<void> {
  shouldReconnect = false;
  if (socket) {
    try {
      socket.end?.(undefined);
    } catch {
      // `end` pode lançar se o socket nunca chegou a abrir; ignorado.
    }
  }
  socket = null;
  saveCreds = null;
  connectionState = "closed";
  hasSession = false;
  latestQr = null;
  latestPairingCode = null;
  phoneNumber = null;
  startPromise = null;
}

// Desconecta e apaga a sessão persistida; reinicia o pareamento (novo QR).
export async function resetSession(): Promise<void> {
  await disconnectSocket();
  rmSync(config.whatsappSessionDir, { recursive: true, force: true });
  shouldReconnect = true;
  if (repo) void startSocket(repo);
}

function extractPhoneNumber(jid: string | undefined | null): string | null {
  if (!jid) return null;
  const digits = jid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}
