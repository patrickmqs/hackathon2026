import { StubAiPipeline } from "../../src/services/ai/stub.js";

export class SuccessfulStubPipeline extends StubAiPipeline {
  override async analyze(...args: Parameters<StubAiPipeline["analyze"]>) {
    const analysis = await super.analyze(...args);
    return {
      ...analysis,
      meeting_summary: {
        headline: "Resumo de teste",
        executive_summary: "Resumo de teste.",
        topics: [],
        key_decisions: [],
        pending_decisions: [],
        next_steps: [],
        open_points: [],
        meta: {
          prompt_version: "test-v1",
          model: "test",
          generated_at: new Date().toISOString(),
          basis: "analysis" as const,
        },
      },
    };
  }
}
