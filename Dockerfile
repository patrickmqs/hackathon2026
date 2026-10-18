# Backend Proposal AI — contexto de build = raiz do repositório (usa ../shared).
FROM node:22-bookworm-slim

WORKDIR /app/backend

# Dependências (inclui devDependencies: tsc e prisma são necessários no build)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Chromium + libs de sistema para o Playwright gerar os PDFs
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY shared /app/shared
# ../shared importa `zod`: faz o node_modules do backend ser resolvível a partir de /app/shared
RUN ln -s /app/backend/node_modules /app/node_modules
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build \
    # tsc não copia arquivos não-TS: prompts (.md) e templates do PDF
    && cp src/services/aiAnalysis/prompts/*.md dist/backend/src/services/aiAnalysis/prompts/ \
    && cp -r src/templates dist/backend/src/templates

ENV NODE_ENV=production \
    APP_ENV=production \
    DEMO_MODE=false \
    STORAGE_DIR=/data/storage \
    WHATSAPP_SESSION_DIR=/data/storage/whatsapp

EXPOSE 8000

# Aplica migrations pendentes e sobe o servidor (PORT é injetada pela plataforma).
# O Neon (URL "-pooler" = pgbouncer) não segura o advisory lock do Prisma e o migrate estoura P1002;
# com uma única réplica o lock é dispensável.
CMD ["sh", "-c", "PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy && node dist/backend/src/index.js"]
