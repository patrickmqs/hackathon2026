import { randomUUID } from "node:crypto";
import type {
  ApprovalRecord,
  AnalysisRecord,
  CreateApprovalInput,
  CreateAnalysisInput,
  CreateEventInput,
  CreateMeetingInput,
  CreatePdfInput,
  CreateProjectInput,
  CreateProposalInput,
  CreateVersionInput,
  EventRecord,
  MeetingRecord,
  Page,
  Patch,
  PdfArtifactRecord,
  ProjectRecord,
  ProposalRecord,
  ProposalVersionRecord,
  Repository,
  TranscriptRecord,
} from "./repo.js";

function now(): string {
  return new Date().toISOString();
}

// Implementação em memória do Repository — determinística e sem I/O.
// Usada em testes de rota e como fallback de demo sem banco.
export class MemoryRepository implements Repository {
  private projects = new Map<string, ProjectRecord>();
  private meetings = new Map<string, MeetingRecord>();
  private transcripts = new Map<string, TranscriptRecord>();
  private analyses = new Map<string, AnalysisRecord>();
  private proposals = new Map<string, ProposalRecord>();
  private versions = new Map<string, ProposalVersionRecord>();
  private approvals = new Map<string, ApprovalRecord>();
  private pdfs = new Map<string, PdfArtifactRecord>();
  private events = new Map<string, EventRecord>();

  private id(): string {
    return randomUUID();
  }

  // Projects
  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    const rec: ProjectRecord = {
      id: this.id(),
      name: input.name,
      description: input.description,
      client: input.client,
      status: "no_meeting",
      createdAt: now(),
      updatedAt: now(),
    };
    this.projects.set(rec.id, rec);
    return rec;
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    return this.projects.get(id) ?? null;
  }

  async listProjects(limit: number, offset: number): Promise<Page<ProjectRecord>> {
    const all = [...this.projects.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items: all.slice(offset, offset + limit), total: all.length };
  }

  async updateProject(id: string, patch: Patch<ProjectRecord>): Promise<ProjectRecord | null> {
    const rec = this.projects.get(id);
    if (!rec) return null;
    const updated = { ...rec, ...patch, id: rec.id, updatedAt: now() };
    this.projects.set(id, updated);
    return updated;
  }

  async listMeetings(projectId: string): Promise<MeetingRecord[]> {
    return [...this.meetings.values()]
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listProposals(projectId: string): Promise<ProposalRecord[]> {
    return [...this.proposals.values()]
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Meetings
  async createMeeting(input: CreateMeetingInput): Promise<MeetingRecord> {
    const rec: MeetingRecord = {
      id: this.id(),
      projectId: input.projectId,
      sourceType: input.sourceType,
      status: input.status,
      title: input.title,
      audioPath: input.audioPath,
      error: null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.meetings.set(rec.id, rec);
    return rec;
  }

  async getMeeting(id: string): Promise<MeetingRecord | null> {
    return this.meetings.get(id) ?? null;
  }

  async updateMeeting(id: string, patch: Patch<MeetingRecord>): Promise<MeetingRecord | null> {
    const rec = this.meetings.get(id);
    if (!rec) return null;
    const updated = { ...rec, ...patch, id: rec.id, updatedAt: now() };
    this.meetings.set(id, updated);
    return updated;
  }

  async createTranscript(input: { meetingId: string; text: string; segments: unknown; metadata: unknown }): Promise<TranscriptRecord> {
    const rec: TranscriptRecord = {
      id: this.id(),
      meetingId: input.meetingId,
      text: input.text,
      segments: input.segments,
      metadata: input.metadata,
      createdAt: now(),
    };
    this.transcripts.set(input.meetingId, rec);
    return rec;
  }

  async getTranscript(meetingId: string): Promise<TranscriptRecord | null> {
    return this.transcripts.get(meetingId) ?? null;
  }

  // Analysis
  async createAnalysis(input: CreateAnalysisInput): Promise<AnalysisRecord> {
    const rec: AnalysisRecord = {
      id: this.id(),
      meetingId: input.meetingId,
      content: input.content,
      promptVersion: input.promptVersion,
      reviewCompleted: false,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.analyses.set(rec.id, rec);
    return rec;
  }

  async getAnalysis(meetingId: string): Promise<AnalysisRecord | null> {
    for (const a of this.analyses.values()) {
      if (a.meetingId === meetingId) return a;
    }
    return null;
  }

  async updateAnalysis(id: string, patch: Patch<AnalysisRecord>): Promise<AnalysisRecord | null> {
    const rec = this.analyses.get(id);
    if (!rec) return null;
    const updated = { ...rec, ...patch, id: rec.id, updatedAt: now() };
    this.analyses.set(id, updated);
    return updated;
  }

  // Proposals & versions
  async createProposal(input: CreateProposalInput): Promise<ProposalRecord> {
    const rec: ProposalRecord = {
      id: this.id(),
      projectId: input.projectId,
      meetingId: input.meetingId,
      status: "draft",
      currentVersion: 0,
      approvedVersion: null,
      createdAt: now(),
    };
    this.proposals.set(rec.id, rec);
    return rec;
  }

  async getProposal(id: string): Promise<ProposalRecord | null> {
    return this.proposals.get(id) ?? null;
  }

  async updateProposal(id: string, patch: Patch<ProposalRecord>): Promise<ProposalRecord | null> {
    const rec = this.proposals.get(id);
    if (!rec) return null;
    const updated = { ...rec, ...patch, id: rec.id };
    this.proposals.set(id, updated);
    return updated;
  }

  async createVersion(input: CreateVersionInput): Promise<ProposalVersionRecord> {
    const rec: ProposalVersionRecord = {
      id: this.id(),
      proposalId: input.proposalId,
      number: input.number,
      content: input.content,
      contentHash: input.contentHash,
      status: "draft",
      createdBy: input.createdBy,
      createdAt: now(),
    };
    this.versions.set(rec.id, rec);
    return rec;
  }

  async getVersion(proposalId: string, number: number): Promise<ProposalVersionRecord | null> {
    for (const v of this.versions.values()) {
      if (v.proposalId === proposalId && v.number === number) return v;
    }
    return null;
  }

  async listVersions(proposalId: string): Promise<ProposalVersionRecord[]> {
    return [...this.versions.values()]
      .filter((v) => v.proposalId === proposalId)
      .sort((a, b) => a.number - b.number);
  }

  async updateVersion(id: string, patch: Patch<ProposalVersionRecord>): Promise<ProposalVersionRecord | null> {
    const rec = this.versions.get(id);
    if (!rec) return null;
    const updated = { ...rec, ...patch, id: rec.id };
    this.versions.set(id, updated);
    return updated;
  }

  // Approval
  async createApproval(input: CreateApprovalInput): Promise<ApprovalRecord> {
    const rec: ApprovalRecord = {
      id: this.id(),
      proposalVersionId: input.proposalVersionId,
      approvedBy: input.approvedBy,
      contentHash: input.contentHash,
      note: input.note,
      approvedAt: now(),
    };
    this.approvals.set(rec.id, rec);
    return rec;
  }

  async getApprovalByVersion(proposalVersionId: string): Promise<ApprovalRecord | null> {
    for (const a of this.approvals.values()) {
      if (a.proposalVersionId === proposalVersionId) return a;
    }
    return null;
  }

  // PDF
  async createPdf(input: CreatePdfInput): Promise<PdfArtifactRecord> {
    const rec: PdfArtifactRecord = {
      id: this.id(),
      proposalVersionId: input.proposalVersionId,
      path: input.path,
      sizeBytes: input.sizeBytes,
      generatedAt: now(),
    };
    this.pdfs.set(input.proposalVersionId, rec);
    return rec;
  }

  async getPdf(proposalVersionId: string): Promise<PdfArtifactRecord | null> {
    return this.pdfs.get(proposalVersionId) ?? null;
  }

  // Events
  async createEvent(input: CreateEventInput): Promise<EventRecord> {
    const rec: EventRecord = {
      id: this.id(),
      projectId: input.projectId,
      type: input.type,
      actor: input.actor,
      payload: input.payload,
      at: now(),
    };
    this.events.set(rec.id, rec);
    return rec;
  }

  async listEvents(projectId: string, limit: number, offset: number): Promise<Page<EventRecord>> {
    const all = [...this.events.values()]
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => b.at.localeCompare(a.at));
    return { items: all.slice(offset, offset + limit), total: all.length };
  }
}
