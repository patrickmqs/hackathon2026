import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { MeetingAnalysis } from "../../schemas/analysis.js";
import { analyzeMeeting } from "../aiAnalysis/pipeline.js";
import { extractProjectInfo, type ProjectInfo } from "../aiAnalysis/projectInfo.js";
import { fromText, transcribeAudio } from "../transcription/service.js";
import type { AiPipeline, AnalyzeOptions, TranscriptResult } from "./pipeline.js";

// Implementação real do contrato AiPipeline: transcrição (gpt-4o-transcribe por padrão) e
// análise completa (extrai → valida → audita → resume) de services/aiAnalysis/pipeline.ts.
export class OpenAiPipeline implements AiPipeline {
  async transcribe(audio: Buffer, options: { language: string | null; filename?: string }): Promise<TranscriptResult> {
    // O serviço valida a extensão e o tamanho a partir de um arquivo; o Buffer vai para um temporário.
    const ext = path.extname(options.filename ?? "").toLowerCase() || ".mp3";
    const tmp = path.join(os.tmpdir(), `proposal-ai-${randomUUID()}${ext}`);
    fs.writeFileSync(tmp, audio);
    try {
      const t = await transcribeAudio(tmp);
      return { text: t.text, segments: t.segments, metadata: t.metadata };
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  async analyze(transcriptText: string, options: AnalyzeOptions): Promise<MeetingAnalysis> {
    // Sem rótulos de tempo/falante quando vem de áudio: fromText reconstrói os segmentos por frase.
    const analysis = await analyzeMeeting(fromText(transcriptText), options.meetingId);
    return analysis as MeetingAnalysis;
  }

  async extractProjectInfo(transcriptText: string): Promise<ProjectInfo | null> {
    return extractProjectInfo(transcriptText);
  }
}
