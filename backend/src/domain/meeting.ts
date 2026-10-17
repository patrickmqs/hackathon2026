import type { MeetingStatus } from "../schemas/common.js";

// Transições de estado de Meeting — ARCHITECTURE §4.
//
//   created ──(áudio)──▶ transcribing ──▶ analyzing ──▶ analysis_ready ──▶ reviewed
//      │                      │                │
//      └──(texto)─────────────┘                └──▶ failed ──(reprocessar)──▶ analyzing/transcribing

export type MeetingStatusEvent = "receive_text" | "receive_audio" | "transcribed" | "analysis_started" | "analysis_done" | "analysis_failed" | "reviewed" | "reprocess";

const TRANSITIONS: Record<MeetingStatus, Partial<Record<MeetingStatusEvent, MeetingStatus>>> = {
  created: { receive_text: "analyzing", receive_audio: "transcribing" },
  transcribing: { transcribed: "analyzing", analysis_failed: "failed" },
  analyzing: { analysis_done: "analysis_ready", analysis_failed: "failed" },
  analysis_ready: { reviewed: "reviewed", reprocess: "analyzing" },
  reviewed: { reprocess: "analyzing" },
  failed: { reprocess: "analyzing", receive_text: "analyzing", receive_audio: "transcribing" },
};

// Aplica um evento e devolve o próximo status; mantém o atual se a transição não é válida.
export function applyMeetingEvent(current: MeetingStatus, event: MeetingStatusEvent): MeetingStatus {
  return TRANSITIONS[current][event] ?? current;
}

export function isMeetingFinal(status: MeetingStatus): boolean {
  return status === "analysis_ready" || status === "reviewed" || status === "failed";
}

// Reprocessamento permitido quando há algo pronto para refazer (API_SPEC §4.3).
export function canReprocess(status: MeetingStatus): boolean {
  return status === "failed" || status === "analysis_ready" || status === "reviewed";
}

export interface MeetingProgress {
  step: string;
  message: string;
}

// Progresso exibido ao frontend durante o polling (API_SPEC §4.3).
export function meetingProgress(status: MeetingStatus): MeetingProgress {
  switch (status) {
    case "created":
      return { step: "created", message: "Aguardando processamento." };
    case "transcribing":
      return { step: "transcribing", message: "Transcrevendo áudio…" };
    case "analyzing":
      return { step: "analyzing", message: "Analisando a reunião…" };
    case "analysis_ready":
      return { step: "analysis_ready", message: "Análise pronta para revisão." };
    case "reviewed":
      return { step: "reviewed", message: "Revisão concluída." };
    case "failed":
      return { step: "failed", message: "Falha no processamento." };
  }
}
