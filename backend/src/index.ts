import { config } from "./core/config.js";
import { createComposer, createPipeline, createRepository } from "./core/container.js";
import { FileStorage } from "./core/storage.js";
import { BaileysWhatsAppAdapter } from "./integrations/whatsapp/baileysAdapter.js";
import { startSocket } from "./integrations/whatsapp/socket.js";
import { JobRunner } from "./services/jobs/runner.js";
import { createApp } from "./app.js";

const repo = createRepository();
const storage = new FileStorage(config.storageDir);
const jobs = new JobRunner({
  repo,
  storage,
  pipeline: createPipeline(),
  staleMinutes: config.jobStaleMinutes,
});

const app = createApp({
  repo,
  storage,
  jobs,
  composer: createComposer(),
  maxUploadMb: config.maxUploadMb,
  corsOrigins: config.corsOrigins,
  adapters: { whatsapp: new BaileysWhatsAppAdapter() },
});

// Sobe o socket do WhatsApp no boot (restaura sessão ou gera QR/pairing code).
void startSocket(repo);

app.listen(config.port, () => {
  console.log(`Servidor rodando em http://localhost:${config.port}`);
});
