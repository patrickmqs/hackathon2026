import { Prisma } from "@prisma/client";
import { prisma } from "./client.js";
import type {
  ApprovalRecord,
  AnalysisRecord,
  ChannelEventRecord,
  CreateApprovalInput,
  CreateAnalysisInput,
  CreateChannelEventInput,
  CreateChannelInput,
  CreateDeliveryInput,
  CreateEventInput,
  CreateMeetingInput,
  CreatePdfInput,
  CreateProjectInput,
  CreateProposalInput,
  CreateVersionInput,
  DeliveryChannelRecord,
  DeliveryRecord,
  EventRecord,
  MeetingRecord,
  OAuthCredentialRecord,
  Page,
  Patch,
  PdfArtifactRecord,
  ProjectRecord,
  ProposalRecord,
  ProposalVersionRecord,
  Repository,
  TranscriptRecord,
} from "./repo.js";

const iso = (d: Date): string => d.toISOString();
const json = (v: Prisma.JsonValue): Record<string, unknown> => v as Record<string, unknown>;

function mapProject(p: {
  id: string;
  name: string;
  description: string | null;
  client: Prisma.JsonValue;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): ProjectRecord {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    client: json(p.client),
    status: p.status,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

function mapMeeting(m: {
  id: string;
  projectId: string;
  sourceType: string;
  status: string;
  title: string | null;
  audioPath: string | null;
  error: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): MeetingRecord {
  return {
    id: m.id,
    projectId: m.projectId,
    sourceType: m.sourceType,
    status: m.status,
    title: m.title,
    audioPath: m.audioPath,
    error: m.error ? json(m.error) : null,
    createdAt: iso(m.createdAt),
    updatedAt: iso(m.updatedAt),
  };
}

function mapAnalysis(a: {
  id: string;
  meetingId: string;
  content: Prisma.JsonValue;
  promptVersion: string | null;
  reviewCompleted: boolean;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AnalysisRecord {
  return {
    id: a.id,
    meetingId: a.meetingId,
    content: json(a.content),
    promptVersion: a.promptVersion,
    reviewCompleted: a.reviewCompleted,
    reviewedBy: a.reviewedBy,
    reviewedAt: a.reviewedAt ? iso(a.reviewedAt) : null,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  };
}

function mapVersion(v: {
  id: string;
  proposalId: string;
  number: number;
  content: Prisma.JsonValue;
  contentHash: string;
  status: string;
  createdBy: string;
  createdAt: Date;
}): ProposalVersionRecord {
  return {
    id: v.id,
    proposalId: v.proposalId,
    number: v.number,
    content: json(v.content),
    contentHash: v.contentHash,
    status: v.status,
    createdBy: v.createdBy,
    createdAt: iso(v.createdAt),
  };
}

function mapDelivery(d: {
  id: string;
  approvalId: string;
  idempotencyKey: string;
  authorizedBy: string;
  status: string;
  authorizedAt: Date;
}): DeliveryRecord {
  return {
    id: d.id,
    approvalId: d.approvalId,
    idempotencyKey: d.idempotencyKey,
    authorizedBy: d.authorizedBy,
    status: d.status,
    authorizedAt: iso(d.authorizedAt),
  };
}

function mapChannel(c: {
  id: string;
  deliveryId: string;
  channel: string;
  recipient: Prisma.JsonValue;
  status: string;
  providerMessageId: string | null;
  error: Prisma.JsonValue | null;
  attempts: number;
  sentAt: Date | null;
  deliveredAt: Date | null;
  lastAttemptAt: Date | null;
}): DeliveryChannelRecord {
  return {
    id: c.id,
    deliveryId: c.deliveryId,
    channel: c.channel,
    recipient: json(c.recipient),
    status: c.status,
    providerMessageId: c.providerMessageId,
    error: c.error ? json(c.error) : null,
    attempts: c.attempts,
    sentAt: c.sentAt ? iso(c.sentAt) : null,
    deliveredAt: c.deliveredAt ? iso(c.deliveredAt) : null,
    lastAttemptAt: c.lastAttemptAt ? iso(c.lastAttemptAt) : null,
  };
}

function mapChannelEvent(e: {
  id: string;
  channelId: string;
  type: string;
  payload: Prisma.JsonValue | null;
  at: Date;
}): ChannelEventRecord {
  return {
    id: e.id,
    channelId: e.channelId,
    type: e.type,
    payload: e.payload ? json(e.payload) : null,
    at: iso(e.at),
  };
}

export class PrismaRepository implements Repository {
  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    const p = await prisma.project.create({
      data: {
        name: input.name,
        description: input.description,
        client: input.client as Prisma.InputJsonValue,
      },
    });
    return mapProject(p);
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const p = await prisma.project.findUnique({ where: { id } });
    return p ? mapProject(p) : null;
  }

  async listProjects(limit: number, offset: number): Promise<Page<ProjectRecord>> {
    const [items, total] = await Promise.all([
      prisma.project.findMany({ orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
      prisma.project.count(),
    ]);
    return { items: items.map(mapProject), total };
  }

  async updateProject(id: string, patch: Patch<ProjectRecord>): Promise<ProjectRecord | null> {
    const p = await prisma.project.update({
      where: { id },
      data: {
        name: patch.name,
        description: patch.description,
        client: patch.client as Prisma.InputJsonValue | undefined,
        status: patch.status,
      },
    });
    return mapProject(p);
  }

  async deleteProject(id: string): Promise<boolean> {
    const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return false;
    // O schema não tem onDelete: Cascade — apaga os dependentes de baixo para cima.
    const versionWhere = { proposalVersion: { proposal: { projectId: id } } };
    await prisma.$transaction([
      prisma.channelEvent.deleteMany({ where: { channel: { delivery: { approval: versionWhere } } } }),
      prisma.deliveryChannel.deleteMany({ where: { delivery: { approval: versionWhere } } }),
      prisma.delivery.deleteMany({ where: { approval: versionWhere } }),
      prisma.approval.deleteMany({ where: versionWhere }),
      prisma.pdfArtifact.deleteMany({ where: versionWhere }),
      prisma.proposalVersion.deleteMany({ where: { proposal: { projectId: id } } }),
      prisma.proposal.deleteMany({ where: { projectId: id } }),
      prisma.transcript.deleteMany({ where: { meeting: { projectId: id } } }),
      prisma.analysis.deleteMany({ where: { meeting: { projectId: id } } }),
      prisma.meeting.deleteMany({ where: { projectId: id } }),
      prisma.event.deleteMany({ where: { projectId: id } }),
      prisma.project.delete({ where: { id } }),
    ]);
    return true;
  }

  async listMeetings(projectId: string): Promise<MeetingRecord[]> {
    const rows = await prisma.meeting.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return rows.map(mapMeeting);
  }

  async listProposals(projectId: string): Promise<ProposalRecord[]> {
    const rows = await prisma.proposal.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return rows.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      meetingId: p.meetingId,
      status: p.status,
      currentVersion: p.currentVersion,
      approvedVersion: p.approvedVersion,
      createdAt: iso(p.createdAt),
    }));
  }

  async createMeeting(input: CreateMeetingInput): Promise<MeetingRecord> {
    const m = await prisma.meeting.create({
      data: {
        projectId: input.projectId,
        sourceType: input.sourceType,
        status: input.status,
        title: input.title,
        audioPath: input.audioPath,
      },
    });
    return mapMeeting(m);
  }

  async getMeeting(id: string): Promise<MeetingRecord | null> {
    const m = await prisma.meeting.findUnique({ where: { id } });
    return m ? mapMeeting(m) : null;
  }

  async updateMeeting(id: string, patch: Patch<MeetingRecord>): Promise<MeetingRecord | null> {
    const m = await prisma.meeting.update({
      where: { id },
      data: {
        status: patch.status,
        title: patch.title,
        audioPath: patch.audioPath,
        error: patch.error as Prisma.InputJsonValue | undefined,
      },
    });
    return mapMeeting(m);
  }

  async createTranscript(input: { meetingId: string; text: string; segments: unknown; metadata: unknown }): Promise<TranscriptRecord> {
    const t = await prisma.transcript.create({
      data: {
        meetingId: input.meetingId,
        text: input.text,
        segments: input.segments as Prisma.InputJsonValue,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
    return {
      id: t.id,
      meetingId: t.meetingId,
      text: t.text,
      segments: t.segments,
      metadata: t.metadata,
      createdAt: iso(t.createdAt),
    };
  }

  async getTranscript(meetingId: string): Promise<TranscriptRecord | null> {
    const t = await prisma.transcript.findUnique({ where: { meetingId } });
    if (!t) return null;
    return {
      id: t.id,
      meetingId: t.meetingId,
      text: t.text,
      segments: t.segments,
      metadata: t.metadata,
      createdAt: iso(t.createdAt),
    };
  }

  async createAnalysis(input: CreateAnalysisInput): Promise<AnalysisRecord> {
    const a = await prisma.analysis.create({
      data: {
        meetingId: input.meetingId,
        content: input.content as Prisma.InputJsonValue,
        promptVersion: input.promptVersion,
      },
    });
    return mapAnalysis(a);
  }

  async getAnalysis(meetingId: string): Promise<AnalysisRecord | null> {
    const a = await prisma.analysis.findUnique({ where: { meetingId } });
    return a ? mapAnalysis(a) : null;
  }

  async updateAnalysis(id: string, patch: Patch<AnalysisRecord>): Promise<AnalysisRecord | null> {
    const a = await prisma.analysis.update({
      where: { id },
      data: {
        content: patch.content as Prisma.InputJsonValue | undefined,
        promptVersion: patch.promptVersion ?? undefined,
        reviewCompleted: patch.reviewCompleted,
        reviewedBy: patch.reviewedBy,
        reviewedAt: patch.reviewedAt ? new Date(patch.reviewedAt) : undefined,
      },
    });
    return mapAnalysis(a);
  }

  async createProposal(input: CreateProposalInput): Promise<ProposalRecord> {
    const p = await prisma.proposal.create({
      data: { projectId: input.projectId, meetingId: input.meetingId },
    });
    return {
      id: p.id,
      projectId: p.projectId,
      meetingId: p.meetingId,
      status: p.status,
      currentVersion: p.currentVersion,
      approvedVersion: p.approvedVersion,
      createdAt: iso(p.createdAt),
    };
  }

  async getProposal(id: string): Promise<ProposalRecord | null> {
    const p = await prisma.proposal.findUnique({ where: { id } });
    if (!p) return null;
    return {
      id: p.id,
      projectId: p.projectId,
      meetingId: p.meetingId,
      status: p.status,
      currentVersion: p.currentVersion,
      approvedVersion: p.approvedVersion,
      createdAt: iso(p.createdAt),
    };
  }

  async updateProposal(id: string, patch: Patch<ProposalRecord>): Promise<ProposalRecord | null> {
    const p = await prisma.proposal.update({
      where: { id },
      data: {
        status: patch.status,
        currentVersion: patch.currentVersion,
        approvedVersion: patch.approvedVersion,
      },
    });
    return {
      id: p.id,
      projectId: p.projectId,
      meetingId: p.meetingId,
      status: p.status,
      currentVersion: p.currentVersion,
      approvedVersion: p.approvedVersion,
      createdAt: iso(p.createdAt),
    };
  }

  async createVersion(input: CreateVersionInput): Promise<ProposalVersionRecord> {
    const v = await prisma.proposalVersion.create({
      data: {
        proposalId: input.proposalId,
        number: input.number,
        content: input.content as Prisma.InputJsonValue,
        contentHash: input.contentHash,
        createdBy: input.createdBy,
      },
    });
    return mapVersion(v);
  }

  async getVersion(proposalId: string, number: number): Promise<ProposalVersionRecord | null> {
    const v = await prisma.proposalVersion.findFirst({ where: { proposalId, number } });
    return v ? mapVersion(v) : null;
  }

  async getVersionById(id: string): Promise<ProposalVersionRecord | null> {
    const v = await prisma.proposalVersion.findUnique({ where: { id } });
    return v ? mapVersion(v) : null;
  }

  async listVersions(proposalId: string): Promise<ProposalVersionRecord[]> {
    const rows = await prisma.proposalVersion.findMany({ where: { proposalId }, orderBy: { number: "asc" } });
    return rows.map(mapVersion);
  }

  async updateVersion(id: string, patch: Patch<ProposalVersionRecord>): Promise<ProposalVersionRecord | null> {
    const v = await prisma.proposalVersion.update({
      where: { id },
      data: { status: patch.status },
    });
    return mapVersion(v);
  }

  async createApproval(input: CreateApprovalInput): Promise<ApprovalRecord> {
    const a = await prisma.approval.create({
      data: {
        proposalVersionId: input.proposalVersionId,
        approvedBy: input.approvedBy,
        contentHash: input.contentHash,
        note: input.note,
      },
    });
    return {
      id: a.id,
      proposalVersionId: a.proposalVersionId,
      approvedBy: a.approvedBy,
      contentHash: a.contentHash,
      note: a.note,
      approvedAt: iso(a.approvedAt),
    };
  }

  async getApprovalByVersion(proposalVersionId: string): Promise<ApprovalRecord | null> {
    const a = await prisma.approval.findUnique({ where: { proposalVersionId } });
    if (!a) return null;
    return {
      id: a.id,
      proposalVersionId: a.proposalVersionId,
      approvedBy: a.approvedBy,
      contentHash: a.contentHash,
      note: a.note,
      approvedAt: iso(a.approvedAt),
    };
  }

  async getApprovalById(id: string): Promise<ApprovalRecord | null> {
    const a = await prisma.approval.findUnique({ where: { id } });
    if (!a) return null;
    return {
      id: a.id,
      proposalVersionId: a.proposalVersionId,
      approvedBy: a.approvedBy,
      contentHash: a.contentHash,
      note: a.note,
      approvedAt: iso(a.approvedAt),
    };
  }

  async createPdf(input: CreatePdfInput): Promise<PdfArtifactRecord> {
    const pdf = await prisma.pdfArtifact.create({
      data: {
        proposalVersionId: input.proposalVersionId,
        path: input.path,
        sizeBytes: input.sizeBytes,
      },
    });
    return {
      id: pdf.id,
      proposalVersionId: pdf.proposalVersionId,
      path: pdf.path,
      sizeBytes: pdf.sizeBytes,
      generatedAt: iso(pdf.generatedAt),
    };
  }

  async getPdf(proposalVersionId: string): Promise<PdfArtifactRecord | null> {
    const pdf = await prisma.pdfArtifact.findFirst({ where: { proposalVersionId }, orderBy: { generatedAt: "desc" } });
    if (!pdf) return null;
    return {
      id: pdf.id,
      proposalVersionId: pdf.proposalVersionId,
      path: pdf.path,
      sizeBytes: pdf.sizeBytes,
      generatedAt: iso(pdf.generatedAt),
    };
  }

  // Deliveries
  async createDelivery(input: CreateDeliveryInput): Promise<DeliveryRecord> {
    const d = await prisma.delivery.create({
      data: {
        approvalId: input.approvalId,
        idempotencyKey: input.idempotencyKey,
        authorizedBy: input.authorizedBy,
      },
    });
    return mapDelivery(d);
  }

  async getDelivery(id: string): Promise<DeliveryRecord | null> {
    const d = await prisma.delivery.findUnique({ where: { id } });
    return d ? mapDelivery(d) : null;
  }

  async getDeliveryByIdempotencyKey(idempotencyKey: string): Promise<DeliveryRecord | null> {
    const d = await prisma.delivery.findUnique({ where: { idempotencyKey } });
    return d ? mapDelivery(d) : null;
  }

  async listDeliveriesByProposal(proposalId: string): Promise<DeliveryRecord[]> {
    const rows = await prisma.delivery.findMany({
      where: { approval: { proposalVersion: { proposalId } } },
      orderBy: { authorizedAt: "desc" },
    });
    return rows.map(mapDelivery);
  }

  async updateDelivery(id: string, patch: Patch<DeliveryRecord>): Promise<DeliveryRecord | null> {
    const d = await prisma.delivery.update({
      where: { id },
      data: { status: patch.status },
    });
    return mapDelivery(d);
  }

  // Delivery channels
  async createChannel(input: CreateChannelInput): Promise<DeliveryChannelRecord> {
    const c = await prisma.deliveryChannel.create({
      data: {
        deliveryId: input.deliveryId,
        channel: input.channel,
        recipient: input.recipient as Prisma.InputJsonValue,
      },
    });
    return mapChannel(c);
  }

  async getChannel(id: string): Promise<DeliveryChannelRecord | null> {
    const c = await prisma.deliveryChannel.findUnique({ where: { id } });
    return c ? mapChannel(c) : null;
  }

  async listChannels(deliveryId: string): Promise<DeliveryChannelRecord[]> {
    const rows = await prisma.deliveryChannel.findMany({ where: { deliveryId }, orderBy: { channel: "asc" } });
    return rows.map(mapChannel);
  }

  async updateChannel(id: string, patch: Patch<DeliveryChannelRecord>): Promise<DeliveryChannelRecord | null> {
    const c = await prisma.deliveryChannel.update({
      where: { id },
      data: {
        status: patch.status,
        providerMessageId: patch.providerMessageId,
        error: patch.error as Prisma.InputJsonValue | undefined,
        attempts: patch.attempts,
        sentAt: patch.sentAt ? new Date(patch.sentAt) : undefined,
        deliveredAt: patch.deliveredAt ? new Date(patch.deliveredAt) : undefined,
        lastAttemptAt: patch.lastAttemptAt ? new Date(patch.lastAttemptAt) : undefined,
      },
    });
    return mapChannel(c);
  }

  async findChannelByProviderMessageId(providerMessageId: string): Promise<DeliveryChannelRecord | null> {
    const c = await prisma.deliveryChannel.findFirst({ where: { providerMessageId } });
    return c ? mapChannel(c) : null;
  }

  // Channel events
  async createChannelEvent(input: CreateChannelEventInput): Promise<ChannelEventRecord> {
    const e = await prisma.channelEvent.create({
      data: {
        channelId: input.channelId,
        type: input.type,
        payload: input.payload === null ? Prisma.JsonNull : (input.payload as Prisma.InputJsonValue),
      },
    });
    return mapChannelEvent(e);
  }

  async listChannelEvents(channelId: string): Promise<ChannelEventRecord[]> {
    const rows = await prisma.channelEvent.findMany({ where: { channelId }, orderBy: { at: "asc" } });
    return rows.map(mapChannelEvent);
  }

  async createEvent(input: CreateEventInput): Promise<EventRecord> {
    const e = await prisma.event.create({
      data: {
        projectId: input.projectId,
        type: input.type,
        actor: input.actor,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return {
      id: e.id,
      projectId: e.projectId,
      type: e.type,
      actor: e.actor,
      payload: e.payload,
      at: iso(e.at),
    };
  }

  async listEvents(projectId: string, limit: number, offset: number): Promise<Page<EventRecord>> {
    const [rows, total] = await Promise.all([
      prisma.event.findMany({ where: { projectId }, orderBy: { at: "desc" }, skip: offset, take: limit }),
      prisma.event.count({ where: { projectId } }),
    ]);
    return {
      items: rows.map((e) => ({
        id: e.id,
        projectId: e.projectId,
        type: e.type,
        actor: e.actor,
        payload: e.payload,
        at: iso(e.at),
      })),
      total,
    };
  }

  // OAuth credentials
  async getOAuthCredential(provider: string): Promise<OAuthCredentialRecord | null> {
    const c = await prisma.oAuthCredential.findUnique({ where: { provider } });
    if (!c) return null;
    return {
      provider: c.provider,
      accountEmail: c.accountEmail,
      token: json(c.token),
      updatedAt: iso(c.updatedAt),
    };
  }

  async upsertOAuthCredential(provider: string, accountEmail: string, token: Record<string, unknown>): Promise<OAuthCredentialRecord> {
    const c = await prisma.oAuthCredential.upsert({
      where: { provider },
      update: { accountEmail, token: token as Prisma.InputJsonValue },
      create: { provider, accountEmail, token: token as Prisma.InputJsonValue },
    });
    return {
      provider: c.provider,
      accountEmail: c.accountEmail,
      token: json(c.token),
      updatedAt: iso(c.updatedAt),
    };
  }

  async deleteOAuthCredential(provider: string): Promise<void> {
    await prisma.oAuthCredential.delete({ where: { provider } }).catch(() => {
      // Idempotente: não falhar se não existir.
    });
  }
}
