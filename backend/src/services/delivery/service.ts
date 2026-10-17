import { DomainError } from "../../core/errors.js";
import type { FileStorage } from "../../core/storage.js";
import { EVENT_TYPES } from "../../domain/events.js";
import type {
  DeliveryChannelRecord,
  DeliveryRecord,
  ProposalVersionRecord,
  Repository,
} from "../../repositories/repo.js";
import type { Channel, ChannelStatus, DeliveryStatus } from "../../schemas/common.js";
import type { ProposalContent } from "../../schemas/proposal.js";
import { generatePdf } from "../pdf/renderer.js";
import type {
  AdapterRegistry,
  ChannelAdapter,
  ChannelSendRequest,
  PdfResolver,
  ProviderError,
  ResolvedPdf,
} from "./types.js";

// Estados terminais de canal (não mudam sem retry) e estados de sucesso.
const TERMINAL_CHANNEL_STATUSES: ReadonlySet<ChannelStatus> = new Set([
  "sent",
  "delivered",
  "read",
  "failed",
  "skipped_no_credentials",
]);
const SUCCESS_CHANNEL_STATUSES: ReadonlySet<ChannelStatus> = new Set(["sent", "delivered", "read"]);

export interface AuthorizeChannelInput {
  channel: Channel;
  recipient: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface AuthorizeDeliveryInput {
  approvalId: string;
  idempotencyKey: string;
  channels: AuthorizeChannelInput[];
  actor: string;
}

export interface DeliveryServiceDeps {
  repo: Repository;
  storage: FileStorage;
  adapters: AdapterRegistry;
  resolvePdf?: PdfResolver;
}

function now(): string {
  return new Date().toISOString();
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function defaultPdfFilename(version: ProposalVersionRecord): string {
  const content = version.content as { title?: string } | null;
  const title = typeof content?.title === "string" ? content.title : "Proposta";
  const slug =
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "proposta";
  return `${slug}-v${version.number}.pdf`;
}

function validateRecipient(channel: Channel, recipient: Record<string, unknown>): void {
  if (channel === "whatsapp") {
    const phone = recipient.phone;
    if (typeof phone !== "string" || !/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw new DomainError("RECIPIENT_INVALID", "Telefone inválido para WhatsApp (use E.164, ex. +5511999990000).");
    }
    return;
  }
  if (channel === "gmail") {
    const email = recipient.email;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new DomainError("RECIPIENT_INVALID", "E-mail inválido para Gmail.");
    }
    return;
  }
  throw new DomainError("RECIPIENT_INVALID", `Canal desconhecido: ${channel}.`);
}

export class DeliveryService {
  private readonly adapters: AdapterRegistry;
  private readonly resolvePdf: PdfResolver;

  constructor(private readonly deps: DeliveryServiceDeps) {
    this.adapters = deps.adapters;
    this.resolvePdf = deps.resolvePdf ?? ((version) => this.defaultResolvePdf(version));
  }

  async authorizeDelivery(input: AuthorizeDeliveryInput): Promise<{
    delivery: DeliveryRecord;
    channels: DeliveryChannelRecord[];
  }> {
    // Idempotência: mesma chave + mesmo payload → devolve o existente.
    const existing = await this.deps.repo.getDeliveryByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      const existingChannels = await this.deps.repo.listChannels(existing.id);
      if (!payloadMatches(existing, existingChannels, input)) {
        throw new DomainError("IDEMPOTENCY_CONFLICT", "Idempotency key reutilizada com payload diferente.");
      }
      return { delivery: existing, channels: existingChannels };
    }

    // Valida que a aprovação aponta para uma versão `approved` (não `superseded`).
    const approval = await this.deps.repo.getApprovalById(input.approvalId);
    if (!approval) throw new DomainError("APPROVAL_REQUIRED", "Aprovação não encontrada.");
    const version = await this.deps.repo.getVersionById(approval.proposalVersionId);
    if (!version) throw new DomainError("APPROVAL_REQUIRED", "Versão da aprovação não encontrada.");
    if (version.status === "superseded") {
      throw new DomainError("APPROVAL_SUPERSEDED", "A versão aprovada foi substituída por uma mais recente.");
    }
    if (version.status !== "approved") {
      throw new DomainError("APPROVAL_REQUIRED", "A proposta precisa estar aprovada antes do envio.");
    }

    // Valida destinatários antes de criar qualquer registro (nada é enviado se inválido).
    for (const c of input.channels) {
      validateRecipient(c.channel, { ...c.recipient, ...(c.options ?? {}) });
    }

    const delivery = await this.deps.repo.createDelivery({
      approvalId: input.approvalId,
      idempotencyKey: input.idempotencyKey,
      authorizedBy: input.actor,
    });

    const channels: DeliveryChannelRecord[] = [];
    for (const c of input.channels) {
      const recipient = { ...c.recipient, ...(c.options ?? {}) };
      const channel = await this.deps.repo.createChannel({
        deliveryId: delivery.id,
        channel: c.channel,
        recipient,
      });
      const adapter = this.adapters[c.channel];
      const configured = adapter ? await adapter.isConfigured() : false;
      if (!configured) {
        await this.deps.repo.updateChannel(channel.id, {
          status: "skipped_no_credentials",
          error: { code: "CHANNEL_NOT_CONFIGURED", message: channelNotConfiguredMessage(c.channel) },
        });
        await this.deps.repo.createChannelEvent({
          channelId: channel.id,
          type: "skipped",
          payload: { code: "CHANNEL_NOT_CONFIGURED" },
        });
      }
      const fresh = await this.deps.repo.getChannel(channel.id);
      if (fresh) channels.push(fresh);
    }

    // Registra na timeline do projeto (melhor esforço; não bloqueia o envio).
    await this.writeAuthorizedEvent(version, delivery, input.actor);
    await this.recomputeDeliveryStatus(delivery.id);

    const updatedDelivery = (await this.deps.repo.getDelivery(delivery.id)) ?? delivery;
    return { delivery: updatedDelivery, channels };
  }

  async dispatchChannel(channelId: string): Promise<DeliveryChannelRecord> {
    const channel = await this.deps.repo.getChannel(channelId);
    if (!channel) throw new DomainError("NOT_FOUND", "Canal de envio não encontrado.");
    if (channel.status === "skipped_no_credentials" || SUCCESS_CHANNEL_STATUSES.has(channel.status as ChannelStatus)) {
      return channel; // já resolvido; dispatch é idempotente
    }

    const adapter = this.adapters[channel.channel as Channel];
    if (!adapter) {
      return this.markSkipped(channel, "CHANNEL_NOT_CONFIGURED", channelNotConfiguredMessage(channel.channel as Channel));
    }

    await this.deps.repo.updateChannel(channel.id, {
      status: "sending",
      attempts: channel.attempts + 1,
      lastAttemptAt: now(),
      error: null,
    });
    const sending = (await this.deps.repo.getChannel(channel.id))!;

    if (!(await adapter.isConfigured())) {
      return this.markSkipped(sending, "CHANNEL_NOT_CONFIGURED", channelNotConfiguredMessage(channel.channel as Channel));
    }

    const request = await this.buildSendRequest(sending);
    const result = await adapter.send(request);

    if (result.ok) {
      await this.deps.repo.updateChannel(channel.id, {
        status: "sent",
        providerMessageId: result.providerMessageId,
        sentAt: now(),
        error: null,
      });
      await this.deps.repo.createChannelEvent({
        channelId: channel.id,
        type: "sent",
        payload: { provider_message_id: result.providerMessageId },
      });
    } else {
      const error = result.error ?? ({ code: "UNKNOWN", message: "Falha desconhecida.", retryable: false } satisfies ProviderError);
      await this.deps.repo.updateChannel(channel.id, {
        status: "failed",
        error: { code: error.code, message: error.message, retryable: error.retryable },
      });
      await this.deps.repo.createChannelEvent({
        channelId: channel.id,
        type: "failed",
        payload: { code: error.code, message: error.message, retryable: error.retryable },
      });
    }

    await this.recomputeDeliveryStatus(channel.deliveryId);
    return (await this.deps.repo.getChannel(channel.id))!;
  }

  async retryChannel(channelId: string): Promise<DeliveryChannelRecord> {
    const channel = await this.deps.repo.getChannel(channelId);
    if (!channel) throw new DomainError("NOT_FOUND", "Canal de envio não encontrado.");
    if (channel.status !== "failed") {
      throw new DomainError("CHANNEL_NOT_RETRYABLE", "Apenas canais em estado failed podem ser reenviados.");
    }
    const error = channel.error as { retryable?: boolean } | null;
    if (error && error.retryable === false) {
      throw new DomainError("CHANNEL_NOT_RETRYABLE", "Esta falha não permite reenvio automático.");
    }

    await this.deps.repo.createChannelEvent({ channelId, type: "retry_requested", payload: {} });
    await this.deps.repo.updateChannel(channelId, { status: "queued", error: null });
    return this.dispatchChannel(channelId);
  }

  private async defaultResolvePdf(version: ProposalVersionRecord): Promise<ResolvedPdf> {
    const existing = await this.deps.repo.getPdf(version.id);
    if (existing) return { path: existing.path, filename: defaultPdfFilename(version) };
    const buffer = await generatePdf(version.content as ProposalContent);
    const path = this.deps.storage.savePdf(version.proposalId, version.number, buffer);
    await this.deps.repo.createPdf({ proposalVersionId: version.id, path, sizeBytes: buffer.length });
    return { path, filename: defaultPdfFilename(version) };
  }

  private async buildSendRequest(channel: DeliveryChannelRecord): Promise<ChannelSendRequest> {
    const delivery = await this.deps.repo.getDelivery(channel.deliveryId);
    const approval = await this.deps.repo.getApprovalById(delivery!.approvalId);
    const version = await this.deps.repo.getVersionById(approval!.proposalVersionId);
    const pdf = await this.resolvePdf(version!);
    const recipient = channel.recipient as Record<string, unknown>;

    return {
      recipient: {
        email: asString(recipient.email),
        phone: asString(recipient.phone),
        name: asString(recipient.name),
      },
      subject: asNullableString(recipient.subject),
      bodyText: asNullableString(recipient.body_text ?? recipient.caption),
      attachmentPath: pdf.path,
      attachmentFilename: pdf.filename,
      publicPdfUrl: null,
      metadata: { deliveryId: delivery!.id, channelId: channel.id, proposalVersion: version!.number },
    };
  }

  private async markSkipped(channel: DeliveryChannelRecord, code: string, message: string): Promise<DeliveryChannelRecord> {
    await this.deps.repo.updateChannel(channel.id, { status: "skipped_no_credentials", error: { code, message } });
    await this.deps.repo.createChannelEvent({ channelId: channel.id, type: "skipped", payload: { code, message } });
    await this.recomputeDeliveryStatus(channel.deliveryId);
    return (await this.deps.repo.getChannel(channel.id))!;
  }

  private async recomputeDeliveryStatus(deliveryId: string): Promise<void> {
    const channels = await this.deps.repo.listChannels(deliveryId);
    await this.deps.repo.updateDelivery(deliveryId, { status: aggregateDeliveryStatus(channels) });
  }

  private async writeAuthorizedEvent(
    version: ProposalVersionRecord,
    delivery: DeliveryRecord,
    actor: string,
  ): Promise<void> {
    try {
      const proposal = await this.deps.repo.getProposal(version.proposalId);
      if (!proposal) return;
      await this.deps.repo.createEvent({
        projectId: proposal.projectId,
        type: EVENT_TYPES.DELIVERY_AUTHORIZED,
        actor,
        payload: { delivery_id: delivery.id, proposal_id: proposal.id, version: version.number },
      });
    } catch {
      // Timeline é observacional; falha aqui não pode bloquear o envio.
    }
  }
}

function channelNotConfiguredMessage(channel: Channel): string {
  return channel === "whatsapp"
    ? "WhatsApp não conectado. Conecte em Configurações."
    : "Gmail não conectado. Conecte em Configurações.";
}

function aggregateDeliveryStatus(channels: DeliveryChannelRecord[]): DeliveryStatus {
  if (channels.length === 0) return "authorized";
  const allTerminal = channels.every((c) => TERMINAL_CHANNEL_STATUSES.has(c.status as ChannelStatus));
  if (!allTerminal) return "in_progress";
  const hasSuccess = channels.some((c) => SUCCESS_CHANNEL_STATUSES.has(c.status as ChannelStatus));
  const hasFailure = channels.some(
    (c) => (c.status as ChannelStatus) === "failed" || (c.status as ChannelStatus) === "skipped_no_credentials",
  );
  if (hasSuccess && hasFailure) return "partially_failed";
  if (hasSuccess) return "completed";
  return "failed";
}

function payloadMatches(
  existing: DeliveryRecord,
  existingChannels: DeliveryChannelRecord[],
  input: AuthorizeDeliveryInput,
): boolean {
  if (existing.approvalId !== input.approvalId) return false;
  if (existingChannels.length !== input.channels.length) return false;
  for (const c of input.channels) {
    const recipient = { ...c.recipient, ...(c.options ?? {}) };
    const match = existingChannels.some(
      (ec) => ec.channel === c.channel && stableStringify(ec.recipient) === stableStringify(recipient),
    );
    if (!match) return false;
  }
  return true;
}

export type { ChannelAdapter };
