import { describe, expect, it } from "vitest";
import type { MeetingRecord, ProjectRecord } from "../../../src/repositories/repo.js";
import { StubAiPipeline } from "../../../src/services/ai/stub.js";
import { renderProposalHtml } from "../../../src/services/pdf/renderer.js";
import { buildProposalContent } from "../../../src/services/proposal/builder.js";

const project: ProjectRecord = {
  id: "p1",
  name: "Portal B2B",
  description: null,
  client: { company: "Acme" },
  status: "reviewed",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const meeting: MeetingRecord = {
  id: "m1",
  projectId: "p1",
  sourceType: "text",
  status: "reviewed",
  title: null,
  audioPath: null,
  error: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("renderProposalHtml", () => {
  it("renderiza o template com título e seções", async () => {
    const analysis = await new StubAiPipeline().analyze("resumo da reunião", {
      meetingId: "m1",
      language: "pt-BR",
      sourceType: "text",
    });
    const content = buildProposalContent({ project, meeting, analysis });
    const html = renderProposalHtml(content);
    expect(html).toContain("Portal B2B");
    expect(html).toContain("Sumário executivo");
    expect(html).toContain("Estimativas");
    expect(html).toContain("Condições comerciais");
  });
});
