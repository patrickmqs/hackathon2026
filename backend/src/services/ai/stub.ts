import type { MeetingAnalysis } from "../../schemas/analysis.js";
import type { AiPipeline, TranscriptResult } from "./pipeline.js";

// Pipeline stub determinístico (sem I/O externo) — usado em demo e testes até a
// implementação real da OpenAI (A5/A9) substituir `createPipeline()`.
export class StubAiPipeline implements AiPipeline {
  async transcribe(_audio: Buffer, options: { language: string | null }): Promise<TranscriptResult> {
    return {
      text: "[transcrição stub] Áudio recebido; pipeline OpenAI real ainda não implementado (A5).",
      segments: [],
      metadata: { language: options.language, source_type: "audio" },
    };
  }

  async analyze(
    transcriptText: string,
    options: { meetingId: string; language: string | null; sourceType: "text" | "audio" },
  ): Promise<MeetingAnalysis> {
    const now = new Date().toISOString();
    return {
      meeting_id: options.meetingId,
      summary: transcriptText.slice(0, 500),
      participants: [],
      client_needs: [],
      requirements: [],
      modules: [],
      decisions: [],
      commitments: [],
      open_issues: [],
      tech_suggestions: [],
      transcript_metadata: {
        language: options.language,
        duration_ms: null,
        has_speakers: false,
        has_timestamps: false,
        source_type: options.sourceType,
      },
      limitations: ["Extração stub (demo): pipeline OpenAI real é responsabilidade A5/A9."],
      meeting_summary: null,
      review_completed: false,
      meta: {
        schema_version: "1.0",
        prompt_version: "stub-v1",
        model: "stub",
        generated_at: now,
      },
    };
  }
}
