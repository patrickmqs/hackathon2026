import type { ProposalVersionRecord } from "../../repositories/repo.js";
import type { Channel } from "../../schemas/common.js";

// Contrato dos adapters de canal — INTEGRATIONS.md §1.
// Os adapters não conhecem "proposta"; recebem um `ChannelSendRequest` genérico e
// devolvem um `ProviderResult`. A camada de delivery decide o que fazer com o resultado.

export interface ChannelSendRequest {
  recipient: { email?: string; phone?: string; name?: string };
  subject: string | null;
  bodyText: string | null;
  attachmentPath: string; // caminho do PDF no FileStorage
  attachmentFilename: string;
  publicPdfUrl: string | null; // URL pública opcional (fallback por link)
  metadata: { deliveryId: string; channelId: string; proposalVersion: number };
}

export interface ProviderError {
  code: string;
  message: string;
  retryable: boolean;
  raw?: unknown;
}

export interface ProviderResult {
  ok: boolean;
  providerMessageId: string | null;
  error: ProviderError | null;
  raw?: unknown;
}

export interface ChannelAdapter {
  readonly channel: Channel;
  isConfigured(): Promise<boolean>;
  send(req: ChannelSendRequest): Promise<ProviderResult>;
}

// Registro de adapters por canal. Canais sem adapter são tratados como não configurados
// (→ skipped_no_credentials), sem exceção.
export type AdapterRegistry = Partial<Record<Channel, ChannelAdapter>>;

export interface ResolvedPdf {
  path: string;
  filename: string;
}

// Resolve (e, se necessário, gera) o PDF da versão aprovada. Injetável para permitir
// testes sem depender do Playwright.
export type PdfResolver = (version: ProposalVersionRecord) => Promise<ResolvedPdf>;
