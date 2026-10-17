import type {
  ApprovalRecord,
  EventRecord,
  MeetingRecord,
  PdfArtifactRecord,
  ProjectRecord,
  ProposalRecord,
  ProposalVersionRecord,
  TranscriptRecord,
} from "../repositories/repo.js";
import type { MeetingStatus } from "../schemas/common.js";
import { meetingProgress } from "../domain/meeting.js";
import { deriveProjectStatus } from "../domain/project.js";

// Serializadores: converte registros internos (camelCase) para os DTOs de API
// (snake_case) — API_SPEC §4.2/§4.3.

export function toProjectDto(
  project: ProjectRecord,
  meetings: MeetingRecord[],
  proposals: ProposalRecord[],
) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    client: project.client,
    status: deriveProjectStatus(meetings, proposals),
    latest_meeting_id: meetings[0]?.id ?? null,
    latest_proposal_id: proposals[0]?.id ?? null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

// O transcript só é exposto quando a análise está pronta ou revisada (API_SPEC §4.3).
const TRANSCRIPT_READY = new Set<MeetingStatus>(["analysis_ready", "reviewed"]);

export function toMeetingDto(meeting: MeetingRecord, transcript: TranscriptRecord | null) {
  const ready = TRANSCRIPT_READY.has(meeting.status as MeetingStatus);
  return {
    id: meeting.id,
    project_id: meeting.projectId,
    title: meeting.title,
    source_type: meeting.sourceType,
    status: meeting.status,
    progress: {
      ...meetingProgress(meeting.status as MeetingStatus),
      started_at: meeting.createdAt,
    },
    transcript: ready && transcript
      ? { text: transcript.text, segments: transcript.segments, metadata: transcript.metadata }
      : null,
    error: meeting.error ?? null,
    created_at: meeting.createdAt,
    updated_at: meeting.updatedAt,
  };
}

// Propostas — API_SPEC §4.5. O resumo de versões omite `content`.
export function toProposalVersionSummaryDto(v: ProposalVersionRecord) {
  return {
    number: v.number,
    status: v.status,
    content_hash: v.contentHash,
    created_by: v.createdBy,
    created_at: v.createdAt,
    pdf: null,
  };
}

export function toProposalDto(proposal: ProposalRecord, versions: ProposalVersionRecord[]) {
  return {
    id: proposal.id,
    project_id: proposal.projectId,
    meeting_id: proposal.meetingId,
    status: proposal.status,
    current_version: proposal.currentVersion,
    approved_version: proposal.approvedVersion,
    versions: versions.map(toProposalVersionSummaryDto),
    created_at: proposal.createdAt,
  };
}

export function toProposalVersionDto(
  proposal: ProposalRecord,
  version: ProposalVersionRecord,
  approval: ApprovalRecord | null,
  pdf: PdfArtifactRecord | null,
) {
  return {
    proposal_id: proposal.id,
    number: version.number,
    status: version.status,
    content: version.content,
    content_hash: version.contentHash,
    created_by: version.createdBy,
    created_at: version.createdAt,
    approval: approval
      ? { id: approval.id, approved_by: approval.approvedBy, approved_at: approval.approvedAt, note: approval.note }
      : null,
    pdf: pdf
      ? { url: pdf.path, generated_at: pdf.generatedAt, size_bytes: pdf.sizeBytes }
      : null,
  };
}

export function toEventDto(event: EventRecord) {
  return {
    id: event.id,
    type: event.type,
    actor: event.actor,
    at: event.at,
    payload: event.payload,
  };
}
