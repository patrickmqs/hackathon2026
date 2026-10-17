export class AiOutputInvalidError extends Error {
  readonly code = "AI_OUTPUT_INVALID";
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "AiOutputInvalidError";
  }
}

export class AiProviderError extends Error {
  readonly code = "AI_PROVIDER_ERROR";
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AiProviderError";
  }
}

export class AiProviderNotConfiguredError extends Error {
  readonly code = "AI_PROVIDER_NOT_CONFIGURED";
  constructor() {
    super("OPENAI_API_KEY não configurada");
    this.name = "AiProviderNotConfiguredError";
  }
}
