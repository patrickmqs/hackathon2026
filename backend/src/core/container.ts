import { config } from "./config.js";
import { MemoryRepository } from "../repositories/memory.js";
import { PrismaRepository } from "../repositories/prisma.js";
import type { Repository } from "../repositories/repo.js";
import type { AiPipeline } from "../services/ai/pipeline.js";
import { OpenAiPipeline } from "../services/ai/openai.js";
import type { ProposalComposer } from "../services/proposal/compose-step.js";
import { compose } from "../services/proposal/composer.js";
import { StubAiPipeline } from "../services/ai/stub.js";

// Fábrica do repositório: modo demo usa memória (sem banco); produção usa Prisma.
export function createRepository(): Repository {
  if (config.demoMode) return new MemoryRepository();
  return new PrismaRepository();
}

// Fábrica do pipeline de IA: real (OpenAI) quando OPENAI_API_KEY existe; stub determinístico caso
// contrário. `AI_PIPELINE=stub` força o stub mesmo com a chave configurada (demo sem gastar crédito).
export function createPipeline(): AiPipeline {
  if (process.env.AI_PIPELINE === "stub" || !config.aiConfigured) return new StubAiPipeline();
  return new OpenAiPipeline();
}

// Redação do texto da proposta pela IA: só com OPENAI_API_KEY e sem AI_PIPELINE=stub; senão o texto
// determinístico do builder é mantido.
export function createComposer(): ProposalComposer | undefined {
  if (process.env.AI_PIPELINE === "stub" || !config.aiConfigured) return undefined;
  return (analysis, estimates, vendor) => compose(analysis, estimates, vendor);
}
