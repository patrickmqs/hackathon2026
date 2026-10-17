import type { MeetingRecord, ProposalRecord } from "../repositories/repo.js";

// Status derivado de Projeto — API_SPEC §4.2.
// O campo `Project.status` persistido é apenas um seed ("no_meeting"); o valor
// verdadeiro é derivado das reuniões e propostas do projeto. "sent" é reservado
// para a autorização de envio (B11) e ainda não é produzido aqui.
export type ProjectStatus =
  | "no_meeting"
  | "processing"
  | "analysis_ready"
  | "reviewed"
  | "proposal_draft"
  | "proposal_approved"
  | "sent"
  | "failed";

// `meetings` e `proposals` devem vir ordenados do mais recente para o mais antigo
// (como retornam `listMeetings`/`listProposals`).
export function deriveProjectStatus(
  meetings: MeetingRecord[],
  proposals: ProposalRecord[],
): ProjectStatus {
  if (meetings.length === 0) return "no_meeting";

  const latest = meetings[0];
  if (latest.status === "failed") return "failed";
  if (
    latest.status === "created" ||
    latest.status === "transcribing" ||
    latest.status === "analyzing"
  ) {
    return "processing";
  }
  if (latest.status === "analysis_ready") return "analysis_ready";

  // status === "reviewed" (revisão concluída)
  if (proposals.length === 0) return "reviewed";
  const latestProposal = proposals[0];
  if (latestProposal.approvedVersion != null) return "proposal_approved";
  return "proposal_draft";
}
