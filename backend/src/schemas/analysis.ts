import { z } from "zod";
import { Confidence, ReviewStatus } from "./common.js";
import { MeetingSummary } from "../../../shared/src/schemas/analysis.js";

// Schema `MeetingAnalysis` — AI_PIPELINE §3. Contrato entre o pipeline de IA e a API.
// Espelha exatamente o schema Zod documentado; é o que valida a saída da extração
// e o que a rota GET/PUT de análise devolve.

const Side = z.enum(["client", "vendor", "unknown"]);

const SourceRef = z.object({
  quote: z.string(), // trecho LITERAL da transcrição (≤ 300 chars)
  segment_id: z.string().nullable().optional(),
  speaker: z.string().nullable().optional(),
  start_ms: z.number().int().nullable().optional(),
  end_ms: z.number().int().nullable().optional(),
});

const ReviewableItem = z.object({
  id: z.string(),
  confidence: Confidence,
  source_refs: z.array(SourceRef).default([]),
  review_status: ReviewStatus.default("pending"),
  reviewer_note: z.string().nullable().optional(),
});

const ClientNeed = ReviewableItem.extend({
  category: z.enum(["problem", "business_goal", "target_audience", "constraint"]),
  description: z.string(),
});

const Requirement = ReviewableItem.extend({
  title: z.string(),
  description: z.string(),
  type: z.enum(["functional", "non_functional", "integration"]),
  priority: z.enum(["must", "should", "could", "unknown"]).default("unknown"),
  module_id: z.string().nullable().optional(),
  depends_on: z.array(z.string()).default([]),
});

const Module = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  requirement_ids: z.array(z.string()).default([]),
  complexity: z.enum(["S", "M", "L", "XL", "unknown"]).default("unknown"),
  complexity_rationale: z.string().nullable().optional(),
});

const Decision = ReviewableItem.extend({
  description: z.string(),
  status: z.enum(["confirmed", "pending_validation"]),
  agreed_by: z.array(z.string()).default([]),
  scope_effect: z.enum(["in_scope", "out_of_scope", "constraint", "other"]).default("other"),
});

const Commitment = ReviewableItem.extend({
  owner: z.string(),
  owner_side: Side,
  description: z.string(),
  due_text: z.string().nullable().optional(),
  status: z.enum(["confirmed", "tentative", "conditional"]),
  caveats: z.string().nullable().optional(),
});

const OpenIssue = ReviewableItem.extend({
  type: z.enum(["missing_info", "vague_requirement", "contradiction", "question", "risk"]),
  description: z.string(),
  impact: z.array(z.enum(["effort", "architecture", "cost", "timeline", "scope"])).default([]),
  suggested_question: z.string().nullable().optional(),
  related_ids: z.array(z.string()).default([]),
});

const TechSuggestion = ReviewableItem.extend({
  category: z.enum(["architecture", "technology", "module", "assumption", "process"]),
  description: z.string(),
  rationale: z.string(),
  risks: z.string().nullable().optional(),
});

const Participant = z.object({
  name: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  side: Side,
});

const TranscriptMetadata = z.object({
  language: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  has_speakers: z.boolean(),
  has_timestamps: z.boolean(),
  source_type: z.enum(["audio", "text"]),
});

const AnalysisMeta = z.object({
  schema_version: z.string().default("1.0"),
  prompt_version: z.string(),
  model: z.string(),
  generated_at: z.string(),
  reviewed_by: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
});

export const MeetingAnalysisSchema = z.object({
  meeting_id: z.string(),
  summary: z.string(),
  participants: z.array(Participant),
  client_needs: z.array(ClientNeed),
  requirements: z.array(Requirement),
  modules: z.array(Module),
  decisions: z.array(Decision),
  commitments: z.array(Commitment),
  open_issues: z.array(OpenIssue),
  tech_suggestions: z.array(TechSuggestion),
  transcript_metadata: TranscriptMetadata,
  limitations: z.array(z.string()),
  // Resumo da reunião (etapa 5b, AI_PIPELINE §3). Sem este campo o parse descartava o resumo em
  // PUT /analysis; `default(null)` mantém compatíveis as análises já gravadas antes dele existir.
  meeting_summary: MeetingSummary.nullable().default(null),
  review_completed: z.boolean().default(false),
  meta: AnalysisMeta,
});

export type MeetingAnalysis = z.infer<typeof MeetingAnalysisSchema>;
