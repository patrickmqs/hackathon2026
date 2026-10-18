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
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build \
    # tsc não copia arquivos não-TS: prompts (.md) e templates do PDF
    && cp src/services/aiAnalysis/prompts/*.md dist/backend/src/services/aiAnalysis/prompts/ \
    && cp -r src/templates dist/backend/src/templates

ENV NODE_ENV=production \
    APP_ENV=production \
    STORAGE_DIR=/data/storage \
    WHATSAPP_SESSION_DIR=/data/storage/whatsapp

EXPOSE 8000

# Aplica migrations pendentes e sobe o servidor (PORT é injetada pela plataforma)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/backend/src/index.js"]
