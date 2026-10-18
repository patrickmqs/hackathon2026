// Wrapper único das chamadas à OpenAI (docs/AI_PIPELINE.md §2).
// Retry com backoff em erro de rede/429/5xx, log de tokens e latência em logs/ai_runs.jsonl.
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z, ZodError } from "zod";
import { AiOutputInvalidError, AiProviderError, AiProviderNotConfiguredError } from "../../core/errors.js";

export interface LoadedPrompt {
  name: string;
  version: string;
  system: string;
  temperature: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface TranscriptionSegment {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
  duration_ms: number | null;
  segments: TranscriptionSegment[]; // vazio quando o modelo não devolve segmentos
  model: string;
}

export const BACKOFF_MS = [1000, 3000, 8000] as const;

let client: OpenAI | null = null;
let sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));

/** Para testes: injeta um client falso e um sleep instantâneo. */
export function __setTestHooks(hooks: { client?: OpenAI | null; sleep?: (ms: number) => Promise<void> }) {
  if (hooks.client !== undefined) client = hooks.client;
  if (hooks.sleep) sleep = hooks.sleep;
}

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiProviderNotConfiguredError();
  client = new OpenAI({ apiKey, maxRetries: 0 }); // o retry é nosso
  return client;
}

// Conexão derrubada no meio da resposta: o undici lança TypeError("terminated") / "fetch failed",
// ou um erro de socket (ECONNRESET etc.), que não vira APIConnectionError do SDK.
function isNetworkDrop(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code ?? "";
  return /^(terminated|fetch failed)$/i.test(e.message)
    || /^(ECONNRESET|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT)$/.test(code);
}

function isRetryable(e: unknown): boolean {
  if (isNetworkDrop(e)) return true;
  if (e instanceof OpenAI.APIConnectionError) return true; // inclui timeout
  if (e instanceof OpenAI.APIError) {
    // 429 por falta de crédito/cota não é transitório: repetir só gasta tempo e atrasa o erro.
    if (e.status === 429 && (e.code === "insufficient_quota" || /no credits|exceeded your current quota/i.test(e.message))) return false;
    return e.status === 429 || (e.status !== undefined && e.status >= 500);
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryable(e)) throw e;
      if (i >= BACKOFF_MS.length) {
        throw new AiProviderError(`OpenAI indisponível após ${i + 1} tentativas: ${(e as Error).message}`, e);
      }
      await sleep(BACKOFF_MS[i]!);
    }
  }
}

function logRun(entry: Record<string, unknown>) {
  try {
    const file = process.env.AI_RUNS_LOG ?? path.resolve(process.cwd(), "logs", "ai_runs.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    // log nunca derruba o pipeline
  }
}

/** Um passo de agente com ferramentas (Responses API): mesmo retry/backoff e log das demais chamadas. */
export async function toolStep(params: {
  model: string;
  instructions: string;
  input: OpenAI.Responses.ResponseInput;
  tools: OpenAI.Responses.FunctionTool[];
  temperature?: number;
  label: string;
}): Promise<OpenAI.Responses.Response> {
  const started = Date.now();
  const base = { kind: "agent", model: params.model, prompt: params.label };
  try {
    const res = await withRetry(() =>
      getClient().responses.create({
        model: params.model,
        instructions: params.instructions,
        input: params.input,
        tools: params.tools,
        temperature: params.temperature,
      }),
    );
    logRun({ ...base, latencyMs: Date.now() - started, input_tokens: res.usage?.input_tokens ?? 0, output_tokens: res.usage?.output_tokens ?? 0, ok: true });
    return res;
  } catch (e) {
    logRun({ ...base, latencyMs: Date.now() - started, ok: false, error: (e as Error).message });
    if (e instanceof OpenAI.APIError) throw new AiProviderError(`Erro da OpenAI (status ${e.status}): ${e.message}`, e);
    throw e;
  }
}

export async function structuredCompletion<T extends z.ZodTypeAny>(opts: {
  prompt: LoadedPrompt;
  input: string;
  schema: T;
  schemaName: string;
  attempt?: number;
  model?: string;
}): Promise<{ data: z.infer<T>; usage: Usage; latencyMs: number }> {
  const model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1";
  const started = Date.now();
  const base = { kind: "chat", model, prompt: `${opts.prompt.name}@${opts.prompt.version}`, attempt: opts.attempt ?? 1 };
  try {
    const res = await withRetry(() =>
      getClient().responses.parse({
        model,
        instructions: opts.prompt.system,
        input: opts.input,
        temperature: opts.prompt.temperature,
        text: { format: zodTextFormat(opts.schema, opts.schemaName) },
      }),
    );
    const latencyMs = Date.now() - started;
    const usage = { input_tokens: res.usage?.input_tokens ?? 0, output_tokens: res.usage?.output_tokens ?? 0 };
    if (res.output_parsed == null) {
      logRun({ ...base, latencyMs, ...usage, ok: false, error: "output_parsed null" });
      throw new AiOutputInvalidError(
        "A OpenAI não devolveu saída estruturada válida (recusa ou JSON inválido)",
        res.output_text,
      );
    }
    logRun({ ...base, latencyMs, ...usage, ok: true });
    return { data: res.output_parsed as z.infer<T>, usage, latencyMs };
  } catch (e) {
    let out: unknown = e;
    if (e instanceof ZodError) {
      out = new AiOutputInvalidError("Saída da OpenAI não confere com o schema", z.prettifyError(e));
    } else if (e instanceof SyntaxError) {
      out = new AiOutputInvalidError(`Saída da OpenAI não é JSON válido: ${e.message}`, e.message);
    } else if (e instanceof OpenAI.APIError) {
      // Erros não retentáveis (400/401/413...): status preservado em `cause`.
      out = new AiProviderError(`Erro da OpenAI (status ${e.status}): ${e.message}`, e);
    }
    if (!(e instanceof AiOutputInvalidError)) {
      logRun({ ...base, latencyMs: Date.now() - started, ok: false, error: (out as Error).message });
    }
    throw out;
  }
}

export async function transcribe(opts: {
  filePath: string;
  language?: string;
  model?: string;
}): Promise<TranscriptionResult> {
  const model = opts.model ?? process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";
  const started = Date.now();
  // Só o whisper-1 devolve segmentos com tempo; os modelos gpt-4o-* aceitam apenas json.
  const verbose = model === "whisper-1";
  try {
    const res = (await withRetry(() =>
      getClient().audio.transcriptions.create({
        file: fs.createReadStream(opts.filePath),
        model,
        ...(opts.language ? { language: opts.language } : {}),
        ...(verbose
          ? { response_format: "verbose_json" as const, timestamp_granularities: ["segment" as const] }
          : { response_format: "json" as const }),
      }),
    )) as unknown as {
      text: string;
      language?: string;
      duration?: number;
      segments?: { id: number; start: number; end: number; text: string }[];
    };

    const segments = (res.segments ?? []).map((s) => ({
      id: s.id,
      start_ms: Math.round(s.start * 1000),
      end_ms: Math.round(s.end * 1000),
      text: s.text.trim(),
    }));
    logRun({ kind: "transcription", model, latencyMs: Date.now() - started, ok: true, segments: segments.length });
    return {
      text: res.text,
      language: res.language ?? opts.language ?? null,
      duration_ms: res.duration != null ? Math.round(res.duration * 1000) : null,
      segments,
      model,
    };
  } catch (e) {
    logRun({ kind: "transcription", model, latencyMs: Date.now() - started, ok: false, error: (e as Error).message });
    throw e;
  }
}
