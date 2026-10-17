import { config } from "./config.js";
import { MemoryRepository } from "../repositories/memory.js";
import { PrismaRepository } from "../repositories/prisma.js";
import type { Repository } from "../repositories/repo.js";
import type { AiPipeline } from "../services/ai/pipeline.js";
import { StubAiPipeline } from "../services/ai/stub.js";

// Fábrica do repositório: modo demo usa memória (sem banco); produção usa Prisma.
export function createRepository(): Repository {
  if (config.demoMode) return new MemoryRepository();
  return new PrismaRepository();
}

// Fábrica do pipeline de IA. Por ora é o stub determinístico; a implementação real
// da OpenAI (A5/A9) substitui este retorno.
export function createPipeline(): AiPipeline {
  return new StubAiPipeline();
}
