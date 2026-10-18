import express from "express";
import type { AppDeps } from "./core/deps.js";
import { DomainError, toErrorEnvelope } from "./core/errors.js";
import { createRequestId } from "./core/logging.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errors.js";
import { analysisRouter } from "./routes/analysis.js";
import { approvalsRouter } from "./routes/approvals.js";
import { deliveriesRouter, proposalDeliveriesRouter } from "./routes/deliveries.js";
import { gmailAuthRouter } from "./routes/gmail.js";
import { healthRouter } from "./routes/health.js";
import { meetingsRouter } from "./routes/meetings.js";
import { projectsRouter } from "./routes/projects.js";
import { proposalCreateRouter, proposalsRouter } from "./routes/proposals.js";
import { whatsappAuthRouter } from "./routes/whatsapp-auth.js";
import { DeliveryService } from "./services/delivery/service.js";

// Fábrica da aplicação Express — separada do `listen()` para permitir testes
// de rota com supertest e injeção de dependências (repo/storage fakes).
export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // request_id — rastreado no envelope de erro e devolvido em X-Request-Id.
  app.use((req, res, next) => {
    const requestId = createRequestId();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });

  if (deps.corsOrigins?.length) {
    app.use(corsMiddleware(deps.corsOrigins));
  }

  app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "Backend rodando" });
  });

  // Serviço de delivery: usa os adapters injetados (ou nenhum, em teste → canais skipped).
  const deliveryService =
    deps.deliveryService ??
    new DeliveryService({ repo: deps.repo, storage: deps.storage, adapters: deps.adapters ?? {} });
  const deliveryDeps = { ...deps, deliveryService };

  app.use(healthRouter());
  app.use("/projects", projectsRouter(deps));
  app.use("/projects/:projectId/proposals", proposalCreateRouter(deps));
  app.use("/meetings", meetingsRouter(deps));
  app.use("/meetings/:meetingId/analysis", analysisRouter(deps));
  app.use("/proposals", proposalDeliveriesRouter(deliveryDeps));
  app.use("/proposals", proposalsRouter(deps));
  app.use("/proposals", approvalsRouter(deps));
  app.use("/deliveries", deliveriesRouter(deliveryDeps));
  app.use("/auth/whatsapp", whatsappAuthRouter());
  app.use("/auth/gmail", gmailAuthRouter());

  // 404 — rota não mapeada.
  app.use((_req, res) => {
    const requestId = (res.locals.requestId as string | undefined) ?? "req_unknown";
    res.status(404).json(toErrorEnvelope(new DomainError("NOT_FOUND", "Rota não encontrada."), requestId));
  });

  app.use(errorHandler);
  return app;
}
