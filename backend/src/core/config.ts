import { z } from "zod";

// Carrega `.env` se existir (Node 21.7+). Sem dependência extra; em produção as
// variáveis vêm do ambiente do container.
try {
  process.loadEnvFile?.();
} catch {
  // `.env` é opcional — variáveis podem já estar no ambiente.
}

const EnvSchema = z.object({
  APP_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8000),
  DATABASE_URL: z.string().default("file:./dev.db"),
  STORAGE_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  JOB_STALE_MINUTES: z.coerce.number().int().positive().default(15),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_PUBLIC_URL: z.string().default("http://localhost:8000"),
  DEMO_MODE: z.string().default("true"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1"),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-transcribe"),
  OPENAI_TIMEOUT_S: z.coerce.number().int().positive().default(120),
  GMAIL_FORCE_FAIL: z.string().default("false"),
  WHATSAPP_FORCE_FAIL: z.string().default("false"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Falha cedo e legível: não sobe com configuração inválida.
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Configuração inválida (backend):\n- ${issues.join("\n- ")}`);
}

const data = parsed.data;

export const config = {
  appEnv: data.APP_ENV,
  port: data.PORT,
  databaseUrl: data.DATABASE_URL,
  storageDir: data.STORAGE_DIR,
  maxUploadMb: data.MAX_UPLOAD_MB,
  jobStaleMinutes: data.JOB_STALE_MINUTES,
  corsOrigins: data.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  frontendUrl: data.FRONTEND_URL,
  backendPublicUrl: data.BACKEND_PUBLIC_URL,
  demoMode: data.DEMO_MODE === "true",
  openaiApiKey: data.OPENAI_API_KEY ?? "",
  openaiModel: data.OPENAI_MODEL,
  openaiTranscribeModel: data.OPENAI_TRANSCRIBE_MODEL,
  openaiTimeoutS: data.OPENAI_TIMEOUT_S,
  gmailForceFail: data.GMAIL_FORCE_FAIL === "true",
  whatsappForceFail: data.WHATSAPP_FORCE_FAIL === "true",
  aiConfigured: Boolean(data.OPENAI_API_KEY),
};

export type AppConfig = typeof config;
