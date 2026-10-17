import { config } from "./config.js";
import { MemoryRepository } from "../repositories/memory.js";
import { PrismaRepository } from "../repositories/prisma.js";
import type { Repository } from "../repositories/repo.js";
import type { AiPipeline } from "../services/ai/pipeline.js";
import { OpenAiPipeline } from "../services/ai/openai.js";
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
