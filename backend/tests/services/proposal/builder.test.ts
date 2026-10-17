import { describe, expect, it } from "vitest";
import { MeetingAnalysisSchema } from "../../../src/schemas/analysis.js";
import { ProposalContentSchema } from "../../../src/schemas/proposal.js";
import { StubAiPipeline } from "../../../src/services/ai/stub.js";
import { buildProposalContent } from "../../../src/services/proposal/builder.js";
import type { MeetingRecord, ProjectRecord } from "../../../src/repositories/repo.js";

const project: ProjectRecord = {
  id: "p1",
  name: "Portal B2B",
  description: null,
  client: { company: "Acme", contact_name: "Ana" },
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

describe("buildProposalContent", () => {
  it("produz ProposalContent válido a partir de uma análise", async () => {
    const analysis = await new StubAiPipeline().analyze("texto da reunião", {
      meetingId: "m1",
      language: "pt-BR",
      sourceType: "text",
    });
    const content = buildProposalContent({ project, meeting, analysis });
    expect(ProposalContentSchema.safeParse(content).success).toBe(true);
    expect(content.title).toBe("Portal B2B");
    expect(content.client.company).toBe("Acme");
    expect(content.estimates.total_hours_max).toBeGreaterThan(0);
    expect(content.meta.source_meeting_id).toBe("m1");
  });

  it("mapeia módulos e requisitos para a proposta", () => {
    const analysis = MeetingAnalysisSchema.parse({
      meeting_id: "m1",
      summary: "resumo",
      participants: [],
      client_needs: [],
      requirements: [
        { id: "req1", confidence: "high", title: "Login", description: "Autenticação", type: "functional", module_id: "mod1" },
      ],
      modules: [
        { id: "mod1", name: "Portal", description: "Sistema", requirement_ids: ["req1"], complexity: "L" },
      ],
      decisions: [],
      commitments: [],
      open_issues: [],
      tech_suggestions: [],
      transcript_metadata: { language: "pt-BR", duration_ms: null, has_speakers: false, has_timestamps: false, source_type: "text" },
      limitations: [],
      review_completed: true,
      meta: { schema_version: "1.0", prompt_version: "p1", model: "m", generated_at: "2026-01-01T00:00:00.000Z" },
    });

    const content = buildProposalContent({ project, meeting, analysis });
    expect(content.modules).toHaveLength(1);
    expect(content.modules[0].complexity).toBe("L");
    expect(content.modules[0].features).toEqual(["Login"]);
    expect(content.requirements_and_integrations[0].title).toBe("Login");
    expect(ProposalContentSchema.safeParse(content).success).toBe(true);
  });
});
