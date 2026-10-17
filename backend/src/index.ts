import { config } from "./core/config.js";
import { createComposer, createPipeline, createRepository } from "./core/container.js";
import { FileStorage } from "./core/storage.js";
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
});

app.listen(config.port, () => {
  console.log(`Servidor rodando em http://localhost:${config.port}`);
});
