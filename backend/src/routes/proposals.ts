import { Router } from "express";
import { z } from "zod";
import type { AppDeps } from "../core/deps.js";
import { DomainError } from "../core/errors.js";
import { parseBody } from "../core/http.js";
import { toProposalDto, toProposalVersionDto } from "../core/serializers.js";
import { EVENT_TYPES } from "../domain/events.js";
import type { ProposalVersionRecord, Repository } from "../repositories/repo.js";
import { requireDemoUser } from "../middleware/demo-user.js";
import type { MeetingAnalysis } from "../schemas/analysis.js";
import { ProposalContentSchema, type ProposalContent } from "../schemas/proposal.js";
import { generatePdf } from "../services/pdf/renderer.js";
import { buildProposalContent } from "../services/proposal/builder.js";
import { applyComposedText } from "../services/proposal/compose-step.js";
import { contentHash } from "../services/proposal/versioning.js";

// Rotas de Propostas — API_SPEC §4.5.
// `proposalsRouter` (GET/POST versões) e `proposalCreateRouter` (POST criação, aninhado
// em /projects/:projectId/proposals) compartilham a lógica de versionamento.

const CreateProposalSchema = z.object({
  meeting_id: z.string().min(1),
  options: z
    .object({
      include_demo_rates: z.boolean().optional(),
      language: z.string().optional(),
    })
    .optional(),
});

const CreateVersionSchema = z.object({
  base_version: z.number().int().positive().optional(),
  content: ProposalContentSchema,
  change_note: z.string().nullable().optional(),
});

export function proposalsRouter(deps: AppDeps): Router {
  const { repo, storage } = deps;
  const router = Router();

  router.get("/:proposalId", async (req, res) => {
    const proposal = await repo.getProposal(req.params.proposalId as string);
    if (!proposal) throw new DomainError("NOT_FOUND", "Proposta não encontrada.");
    const versions = await repo.listVersions(proposal.id);
    res.json(toProposalDto(proposal, versions));
  });

  router.get("/:proposalId/versions/:n", async (req, res) => {
    const proposal = await repo.getProposal(req.params.proposalId as string);
    if (!proposal) throw new DomainError("NOT_FOUND", "Proposta não encontrada.");
    const version = await resolveVersion(repo, proposal.id, req.params.n as string);
    if (!version) throw new DomainError("NOT_FOUND", "Versão não encontrada.");
    const approval = await repo.getApprovalByVersion(version.id);
    const pdf = await repo.getPdf(version.id);
    res.json(toProposalVersionDto(proposal, version, approval, pdf));
  });

  router.post("/:proposalId/versions", requireDemoUser, async (req, res) => {
    const proposalId = req.params.proposalId as string;
    const demoUser = res.locals.demoUser as string;
    const proposal = await repo.getProposal(proposalId);
    if (!proposal) throw new DomainError("NOT_FOUND", "Proposta não encontrada.");

    const input = parseBody(CreateVersionSchema, req.body);
    const versions = await repo.listVersions(proposalId);
    const number = versions.reduce((max, v) => Math.max(max, v.number), 0) + 1;
    const hash = contentHash(input.content);
    const version = await repo.createVersion({
      proposalId,
      number,
      content: input.content,
      contentHash: hash,
      createdBy: demoUser,
    });
    await repo.updateProposal(proposalId, { currentVersion: number });
    await repo.createEvent({
      projectId: proposal.projectId,
      type: EVENT_TYPES.PROPOSAL_VERSION_CREATED,
      actor: demoUser,
      payload: { proposal_id: proposalId, version: number },
    });
    res.status(201).json(toProposalVersionDto(proposal, version, null, null));
  });

  router.post("/:proposalId/versions/:n/pdf", async (req, res) => {
    const proposal = await repo.getProposal(req.params.proposalId as string);
    if (!proposal) throw new DomainError("NOT_FOUND", "Proposta não encontrada.");
    const version = await resolveVersion(repo, proposal.id, req.params.n as string);
    if (!version) throw new DomainError("NOT_FOUND", "Versão não encontrada.");

    const pdf = await renderPdfSafely(version.content as ProposalContent);
    const path = storage.savePdf(proposal.id, version.number, pdf);
    const record = await repo.createPdf({
      proposalVersionId: version.id,
      path,
      sizeBytes: pdf.length,
    });
    res.json({
      url: path,
      generated_at: record.generatedAt,
      size_bytes: record.sizeBytes,
      content_hash: version.contentHash,
    });
  });

  router.get("/:proposalId/versions/:n/pdf", async (req, res) => {
    const proposal = await repo.getProposal(req.params.proposalId as string);
    if (!proposal) throw new DomainError("NOT_FOUND", "Proposta não encontrada.");
    const version = await resolveVersion(repo, proposal.id, req.params.n as string);
    if (!version) throw new DomainError("NOT_FOUND", "Versão não encontrada.");

    const existing = await repo.getPdf(version.id);
    const pdf = existing
      ? storage.read(existing.path)
      : await renderPdfSafely(version.content as ProposalContent);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", req.query.download === "1" ? "attachment" : "inline");
    res.send(pdf);
  });

  return router;
}

async function renderPdfSafely(content: ProposalContent): Promise<Buffer> {
  try {
    return await generatePdf(content);
  } catch {
    throw new DomainError("PDF_RENDER_FAILED", "Falha ao gerar o PDF.");
  }
}

export function proposalCreateRouter(deps: AppDeps): Router {
  const { repo, composer } = deps;
  const router = Router({ mergeParams: true });

  router.post("/", requireDemoUser, async (req, res) => {
    const projectId = (req.params as Record<string, string>).projectId;
    const demoUser = res.locals.demoUser as string;
    const input = parseBody(CreateProposalSchema, req.body);

    const project = await repo.getProject(projectId);
    if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");

    const meeting = await repo.getMeeting(input.meeting_id);
    if (!meeting || meeting.projectId !== projectId) {
      throw new DomainError("NOT_FOUND", "Reunião não encontrada neste projeto.");
    }

    const analysis = await repo.getAnalysis(input.meeting_id);
    if (!analysis) throw new DomainError("MEETING_NOT_READY", "Análise não encontrada.");
    const analysisContent = analysis.content as MeetingAnalysis;
    if (!analysis.reviewCompleted && !analysisContent.review_completed) {
      throw new DomainError(
        "ANALYSIS_REVIEW_INCOMPLETE",
        "A análise precisa ser revisada antes de gerar a proposta.",
      );
    }

    const built = buildProposalContent({
      project,
      meeting,
      analysis: analysisContent,
      language: input.options?.language,
      includeDemoRates: input.options?.include_demo_rates,
    });
    // Texto redigido pela IA (opcional e não bloqueante): só campos textuais; números vêm do builder.
    let content = built;
    if (composer) {
      const step = await applyComposedText(built, analysisContent, composer);
      content = step.content;
      if (step.warning) console.warn(`[proposal] ${step.warning}`);
    }

    const proposal = await repo.createProposal({ projectId, meetingId: meeting.id });
    await repo.createVersion({
      proposalId: proposal.id,
      number: 1,
      content,
      contentHash: contentHash(content),
      createdBy: demoUser,
    });
    await repo.updateProposal(proposal.id, { currentVersion: 1 });
    await repo.createEvent({
      projectId,
      type: EVENT_TYPES.PROPOSAL_VERSION_CREATED,
      actor: demoUser,
      payload: { proposal_id: proposal.id, version: 1 },
    });

    const fresh = await repo.getProposal(proposal.id);
    const versions = await repo.listVersions(proposal.id);
    res.status(201).json(toProposalDto(fresh!, versions));
  });

  return router;
}

async function resolveVersion(
  repo: Repository,
  proposalId: string,
  n: string,
): Promise<ProposalVersionRecord | null> {
  if (n === "latest") {
    const versions = await repo.listVersions(proposalId);
    return versions[versions.length - 1] ?? null;
  }
  if (!/^\d+$/.test(n)) return null;
  return repo.getVersion(proposalId, Number(n));
}
