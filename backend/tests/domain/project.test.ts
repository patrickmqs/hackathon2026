import { describe, expect, it } from "vitest";
import { deriveProjectStatus } from "../../src/domain/project.js";
import type { MeetingRecord, ProposalRecord } from "../../src/repositories/repo.js";

function meeting(status: string): MeetingRecord {
  return {
    id: `m-${status}`,
    projectId: "p1",
    sourceType: "text",
    status,
    title: null,
    audioPath: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function proposal(approvedVersion: number | null): ProposalRecord {
  return {
    id: "pr",
    projectId: "p1",
    meetingId: null,
    status: "draft",
    currentVersion: 1,
    approvedVersion,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("deriveProjectStatus", () => {
  it("sem reunião → no_meeting", () => {
    expect(deriveProjectStatus([], [])).toBe("no_meeting");
  });

  it("reunião falhou → failed", () => {
    expect(deriveProjectStatus([meeting("failed")], [])).toBe("failed");
  });

  it("em processamento (created/transcribing/analyzing)", () => {
    expect(deriveProjectStatus([meeting("created")], [])).toBe("processing");
    expect(deriveProjectStatus([meeting("transcribing")], [])).toBe("processing");
    expect(deriveProjectStatus([meeting("analyzing")], [])).toBe("processing");
  });

  it("análise pronta → analysis_ready", () => {
    expect(deriveProjectStatus([meeting("analysis_ready")], [])).toBe("analysis_ready");
  });

  it("revisada sem proposta → reviewed", () => {
    expect(deriveProjectStatus([meeting("reviewed")], [])).toBe("reviewed");
  });

  it("revisada com proposta rascunho → proposal_draft", () => {
    expect(deriveProjectStatus([meeting("reviewed")], [proposal(null)])).toBe("proposal_draft");
  });

  it("revisada com proposta aprovada → proposal_approved", () => {
    expect(deriveProjectStatus([meeting("reviewed")], [proposal(1)])).toBe("proposal_approved");
  });
});
