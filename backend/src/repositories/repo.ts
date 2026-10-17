// Contrato do repositório (única camada que fala com persistência).
// As rotas/serviços dependem desta interface; há duas implementações:
//   - `memory.ts`  → em memória (testes e demo sem banco)
//   - `prisma.ts`  → Prisma (produção)
// Datas são ISO 8601 (UTC) em string; JSON é `unknown` (objeto já parseado).

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  client: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingRecord {
  id: string;
  projectId: string;
  sourceType: string;
  status: string;
  title: string | null;
  audioPath: string | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptRecord {
  id: string;
  meetingId: string;
  text: string;
  segments: unknown;
  metadata: unknown;
  createdAt: string;
}

export interface AnalysisRecord {
  id: string;
  meetingId: string;
  content: unknown;
  promptVersion: string | null;
  reviewCompleted: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalRecord {
  id: string;
  projectId: string;
  meetingId: string | null;
  status: string;
  currentVersion: number;
  approvedVersion: number | null;
  createdAt: string;
}

export interface ProposalVersionRecord {
  id: string;
  proposalId: string;
  number: number;
  content: unknown;
  contentHash: string;
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  proposalVersionId: string;
  approvedBy: string;
  contentHash: string;
  note: string | null;
  approvedAt: string;
}

export interface PdfArtifactRecord {
  id: string;
  proposalVersionId: string;
  path: string;
  sizeBytes: number;
  generatedAt: string;
}

export interface EventRecord {
  id: string;
  projectId: string;
  type: string;
  actor: string | null;
  payload: unknown;
  at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export type Patch<T> = Partial<T>;

export interface CreateProjectInput {
  name: string;
  description: string | null;
  client: Record<string, unknown>;
}

export interface CreateMeetingInput {
  projectId: string;
  sourceType: "text" | "audio";
  status: string;
  title: string | null;
  audioPath: string | null;
}

export interface CreateAnalysisInput {
  meetingId: string;
  content: unknown;
  promptVersion: string | null;
}

export interface CreateProposalInput {
  projectId: string;
  meetingId: string | null;
}

export interface CreateVersionInput {
  proposalId: string;
  number: number;
  content: unknown;
  contentHash: string;
  createdBy: string;
}

export interface CreateApprovalInput {
  proposalVersionId: string;
  approvedBy: string;
  contentHash: string;
  note: string | null;
}

export interface CreatePdfInput {
  proposalVersionId: string;
  path: string;
  sizeBytes: number;
}

export interface CreateEventInput {
  projectId: string;
  type: string;
  actor: string | null;
  payload: unknown;
}

export interface Repository {
  // Projects
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  getProject(id: string): Promise<ProjectRecord | null>;
  listProjects(limit: number, offset: number): Promise<Page<ProjectRecord>>;
  updateProject(id: string, patch: Patch<ProjectRecord>): Promise<ProjectRecord | null>;
  /** Remove o projeto e tudo que depende dele (reuniões, análises, propostas, eventos). */
  deleteProject(id: string): Promise<boolean>;
  listMeetings(projectId: string): Promise<MeetingRecord[]>;
  listProposals(projectId: string): Promise<ProposalRecord[]>;

  // Meetings
  createMeeting(input: CreateMeetingInput): Promise<MeetingRecord>;
  getMeeting(id: string): Promise<MeetingRecord | null>;
  updateMeeting(id: string, patch: Patch<MeetingRecord>): Promise<MeetingRecord | null>;
  createTranscript(input: { meetingId: string; text: string; segments: unknown; metadata: unknown }): Promise<TranscriptRecord>;
  getTranscript(meetingId: string): Promise<TranscriptRecord | null>;

  // Analysis
  createAnalysis(input: CreateAnalysisInput): Promise<AnalysisRecord>;
  getAnalysis(meetingId: string): Promise<AnalysisRecord | null>;
  updateAnalysis(id: string, patch: Patch<AnalysisRecord>): Promise<AnalysisRecord | null>;

  // Proposals & versions
  createProposal(input: CreateProposalInput): Promise<ProposalRecord>;
  getProposal(id: string): Promise<ProposalRecord | null>;
  updateProposal(id: string, patch: Patch<ProposalRecord>): Promise<ProposalRecord | null>;
  createVersion(input: CreateVersionInput): Promise<ProposalVersionRecord>;
  getVersion(proposalId: string, number: number): Promise<ProposalVersionRecord | null>;
  listVersions(proposalId: string): Promise<ProposalVersionRecord[]>;
  updateVersion(id: string, patch: Patch<ProposalVersionRecord>): Promise<ProposalVersionRecord | null>;

  // Approval
  createApproval(input: CreateApprovalInput): Promise<ApprovalRecord>;
  getApprovalByVersion(proposalVersionId: string): Promise<ApprovalRecord | null>;

  // PDF artifact
  createPdf(input: CreatePdfInput): Promise<PdfArtifactRecord>;
  getPdf(proposalVersionId: string): Promise<PdfArtifactRecord | null>;

  // Events
  createEvent(input: CreateEventInput): Promise<EventRecord>;
  listEvents(projectId: string, limit: number, offset: number): Promise<Page<EventRecord>>;
}
