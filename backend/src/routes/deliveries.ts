import { Router } from "express";
import type { AppDeps } from "../core/deps.js";
import { DomainError } from "../core/errors.js";
import { parseBody } from "../core/http.js";
import { toDeliveryDto } from "../core/serializers.js";
import { requireDemoUser } from "../middleware/demo-user.js";
import type { DeliveryRecord } from "../repositories/repo.js";
import { CreateDeliverySchema } from "../schemas/delivery.js";
import type { DeliveryService } from "../services/delivery/service.js";

// Rotas de envio — API_SPEC §4.7.
// `POST /deliveries` autoriza e dispara o envio em background (202); o frontend faz
// polling em `GET /deliveries/:id` até o status sair de `in_progress`.

export interface DeliveryRouteDeps extends AppDeps {
  deliveryService: DeliveryService;
}

async function buildDeliveryDto(deps: DeliveryRouteDeps, delivery: DeliveryRecord) {
  const channels = await deps.repo.listChannels(delivery.id);
  const approval = await deps.repo.getApprovalById(delivery.approvalId);
  if (!approval) throw new DomainError("NOT_FOUND", "Aprovação não encontrada.");
  const version = await deps.repo.getVersionById(approval.proposalVersionId);
  if (!version) throw new DomainError("NOT_FOUND", "Versão não encontrada.");
  return toDeliveryDto(delivery, channels, version.proposalId, version.number);
}

export function deliveriesRouter(deps: DeliveryRouteDeps): Router {
  const router = Router();

  router.post("/", requireDemoUser, async (req, res) => {
    const actor = res.locals.demoUser as string;
    const input = parseBody(CreateDeliverySchema, req.body);

    const isReplay = (await deps.repo.getDeliveryByIdempotencyKey(input.idempotency_key)) !== null;

    const { delivery, channels } = await deps.deliveryService.authorizeDelivery({
      approvalId: input.approval_id,
      idempotencyKey: input.idempotency_key,
      channels: input.channels.map((c) => ({
        channel: c.channel,
        recipient: c.recipient as Record<string, unknown>,
        options: c.options as Record<string, unknown> | undefined,
      })),
      actor,
    });

    // Envio em background: resposta imediata; o client faz polling do status.
    // Replay idempotente devolve 200 (delivery existente); criação nova devolve 202.
    const queued = channels.filter((c) => c.status === "queued");
    if (queued.length) {
      void Promise.allSettled(queued.map((c) => deps.deliveryService.dispatchChannel(c.id)));
    }

    res.status(isReplay ? 200 : 202).json(await buildDeliveryDto(deps, delivery));
  });

  router.get("/:deliveryId", async (req, res) => {
    const delivery = await deps.repo.getDelivery(req.params.deliveryId as string);
    if (!delivery) throw new DomainError("NOT_FOUND", "Envio não encontrado.");
    res.json(await buildDeliveryDto(deps, delivery));
  });

  router.post("/:deliveryId/channels/:channelId/retry", requireDemoUser, async (req, res) => {
    const delivery = await deps.repo.getDelivery(req.params.deliveryId as string);
    if (!delivery) throw new DomainError("NOT_FOUND", "Envio não encontrado.");
    const channel = await deps.repo.getChannel(req.params.channelId as string);
    if (!channel || channel.deliveryId !== delivery.id) {
      throw new DomainError("NOT_FOUND", "Canal de envio não encontrado.");
    }

    await deps.deliveryService.retryChannel(channel.id);
    res.status(202).json(await buildDeliveryDto(deps, delivery));
  });

  return router;
}

// GET /proposals/:proposalId/deliveries — API_SPEC §4.7.
export function proposalDeliveriesRouter(deps: DeliveryRouteDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/:proposalId/deliveries", async (req, res) => {
    const proposal = await deps.repo.getProposal(req.params.proposalId as string);
    if (!proposal) throw new DomainError("NOT_FOUND", "Proposta não encontrada.");
    const deliveries = await deps.repo.listDeliveriesByProposal(proposal.id);
    const items = [];
    for (const delivery of deliveries) {
      items.push(await buildDeliveryDto(deps, delivery));
    }
    res.json({ items, total: items.length });
  });

  return router;
}
