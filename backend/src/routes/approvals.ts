import { Router } from "express";
import { z } from "zod";
import type { AppDeps } from "../core/deps.js";
import { DomainError } from "../core/errors.js";
import { parseBody } from "../core/http.js";
import { EVENT_TYPES } from "../domain/events.js";
import { requireDemoUser } from "../middleware/demo-user.js";

// Aprovação — API_SPEC §4.6. O cliente reenvia o hash do conteúdo que exibiu,
// garantindo que aprovou exatamente o que viu.

const ApproveSchema = z.object({
  content_hash: z.string().min(1),
  note: z.string().nullable().optional(),
});

export function approvalsRouter(deps: AppDeps): Router {
  const { repo } = deps;
  const router = Router();

  router.post("/:proposalId/versions/:n/approve", requireDemoUser, async (req, res) => {
    const proposalId = req.params.proposalId as string;
    const demoUser = res.locals.demoUser as string;
    const nRaw = req.params.n as string;
    if (!/^\d+$/.test(nRaw)) throw new DomainError("NOT_FOUND", "Versão não encontrada.");
    const n = Number(nRaw);

    const proposal = await repo.getProposal(proposalId);
    if (!proposal) throw new DomainError("NOT_FOUND", "Proposta não encontrada.");
    // Rascunhos podem ser gerados sem revisão, mas só uma análise revisada pode ser aprovada.
    const analysis = proposal.meetingId ? await repo.getAnalysis(proposal.meetingId) : null;
    if (analysis && !analysis.reviewCompleted && !(analysis.content as { review_completed?: boolean }).review_completed) {
      throw new DomainError("ANALYSIS_REVIEW_INCOMPLETE", "Conclua a revisão da análise antes de aprovar a proposta.");
    }
    const version = await repo.getVersion(proposalId, n);
    if (!version) throw new DomainError("NOT_FOUND", "Versão não encontrada.");

    const input = parseBody(ApproveSchema, req.body);
    const normalizedHash = input.content_hash.replace(/^sha256:/, "");
    if (normalizedHash !== version.contentHash) {
      throw new DomainError("PROPOSAL_HASH_MISMATCH", "Hash do conteúdo não confere.");
    }
    if (version.status === "approved") {
      throw new DomainError("PROPOSAL_ALREADY_APPROVED", "Versão já aprovada.");
    }

    // Supersede a versão anteriormente aprovada (se houver).
    const versions = await repo.listVersions(proposalId);
    for (const v of versions) {
      if (v.status === "approved" && v.id !== version.id) {
        await repo.updateVersion(v.id, { status: "superseded" });
      }
    }

    await repo.updateVersion(version.id, { status: "approved" });
    await repo.updateProposal(proposalId, { approvedVersion: n, status: "approved" });
    const approval = await repo.createApproval({
      proposalVersionId: version.id,
      approvedBy: demoUser,
      contentHash: version.contentHash,
      note: input.note ?? null,
    });
    await repo.createEvent({
      projectId: proposal.projectId,
      type: EVENT_TYPES.PROPOSAL_APPROVED,
      actor: demoUser,
      payload: { proposal_id: proposalId, version: n },
    });

    res.status(201).json({
      id: approval.id,
      proposal_id: proposalId,
      version: n,
      content_hash: version.contentHash,
      approved_by: approval.approvedBy,
      approved_at: approval.approvedAt,
      note: approval.note,
    });
  });

  return router;
}
