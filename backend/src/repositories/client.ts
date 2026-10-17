import { PrismaClient } from "@prisma/client";

// Singleton do Prisma — uma instância por processo (evita esgotar conexões).
export const prisma = new PrismaClient();
