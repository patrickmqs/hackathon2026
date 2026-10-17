import type { Repository } from "../repositories/repo.js";
import type { DeliveryService } from "../services/delivery/service.js";
import type { AdapterRegistry } from "../services/delivery/types.js";
import type { JobRunner } from "../services/jobs/runner.js";
import type { ProposalComposer } from "../services/proposal/compose-step.js";
import type { FileStorage } from "./storage.js";

// Dependências injetadas na aplicação (rotas/rotas) — isolam a fábrica `createApp`
// do ambiente real (config, Prisma, disco), tornando as rotas testáveis com fakes.
export interface AppDeps {
  repo: Repository;
  storage: FileStorage;
  jobs?: JobRunner;
  // Redação do texto da proposta pela IA (opcional): sem ela, o texto determinístico do builder é mantido.
  composer?: ProposalComposer;
  maxUploadMb?: number;
  corsOrigins?: string[];
  // Adapters de canal (gmail/whatsapp). Sem adapter, o canal vira skipped_no_credentials.
  adapters?: AdapterRegistry;
  // Serviço de delivery (opcional): `createApp` constrói um padrão a partir de `repo`/`storage`/`adapters`.
  deliveryService?: DeliveryService;
}
