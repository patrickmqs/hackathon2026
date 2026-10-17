// Schema da análise de reunião — versão 1.0 (docs/AI_PIPELINE.md §3).
// Os schemas *Output são enviados ao LLM (Structured Outputs estritos): todo campo
// obrigatório, `.nullable()` no lugar de `.optional()`, sem `.default()`, sem z.record.
import { z } from "zod";

export const Confidence = z.enum(["high", "medium", "low"]);
export const ReviewStatus = z.enum(["pending", "confirmed", "edited", "rejected", "needs_clarification"]);
export const Side = z.enum(["client", "vendor", "unknown"]);

export const SourceRef = z.object({
  quote: z.string().max(300), // trecho LITERAL da transcrição
  segment_id: z.string().nullable(),
  speaker: z.string().nullable(),
  start_ms: z.number().int().nullable(),
  end_ms: z.number().int().nullable(),
});

const Reviewable = z.object({
  id: z.string(), // ex.: "req_003" — estável entre revisões
  confidence: Confidence,
  source_refs: z.array(SourceRef),
  review_status: ReviewStatus, // LLM sempre devolve "pending"
  reviewer_note: z.string().nullable(),
});

export const ClientNeed = Reviewable.extend({
  category: z.enum(["problem", "business_goal", "target_audience", "constraint"]),
  description: z.string(),
});

export const Requirement = Reviewable.extend({
  title: z.string(),
  description: z.string(),
  type: z.enum(["functional", "non_functional", "integration"]),
  priority: z.enum(["must", "should", "could", "unknown"]),
  module_id: z.string().nullable(),
  depends_on: z.array(z.string()),
});

export const Module = z.object({
  id: z.string(), // "mod_01"
  name: z.string(),
  description: z.string(),
  requirement_ids: z.array(z.string()),
  complexity: z.enum(["S", "M", "L", "XL", "unknown"]), // entrada do motor de estimativas
  complexity_rationale: z.string().nullable(),
});

export const Decision = Reviewable.extend({
  description: z.string(),
  status: z.enum(["confirmed", "pending_validation"]),
  agreed_by: z.array(z.string()),
  scope_effect: z.enum(["in_scope", "out_of_scope", "constraint", "other"]),
});

export const Commitment = Reviewable.extend({
  owner: z.string(),
  owner_side: Side,
  description: z.string(),
  due_text: z.string().nullable(), // prazo COMO DITO ("até sexta")
  status: z.enum(["confirmed", "tentative", "conditional"]),
  caveats: z.string().nullable(),
});

export const OpenIssue = Reviewable.extend({
  type: z.enum(["missing_info", "vague_requirement", "contradiction", "question", "risk"]),
  description: z.string(),
  impact: z.array(z.enum(["effort", "architecture", "cost", "timeline", "scope"])),
  suggested_question: z.string().nullable(),
  related_ids: z.array(z.string()),
});

// Nunca tem status de decisão: é sempre "sugestão da IA".
export const TechSuggestion = Reviewable.extend({
  category: z.enum(["architecture", "technology", "module", "assumption", "process"]),
  description: z.string(),
  rationale: z.string(),
  risks: z.string().nullable(),
});

export const Participant = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
  side: Side,
});

export const TranscriptMetadata = z.object({
  language: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  has_speakers: z.boolean(),
  has_timestamps: z.boolean(),
  source_type: z.enum(["audio", "text"]),
});

export const AnalysisMeta = z.object({
  schema_version: z.literal("1.0"),
  prompt_version: z.string(), // "extract@1.0+gap_audit@1.0"
  model: z.string(),
  generated_at: z.iso.datetime(),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.iso.datetime().nullable(),
});

// --- Saídas dos LLMs (estritas) ---
export const ExtractionOutput = z.object({
  summary: z.string(),
  participants: z.array(Participant),
  client_needs: z.array(ClientNeed),
  requirements: z.array(Requirement),
  modules: z.array(Module),
  decisions: z.array(Decision),
  commitments: z.array(Commitment),
  tech_suggestions: z.array(TechSuggestion),
  limitations: z.array(z.string()),
});

export const GapAuditOutput = z.object({
  open_issues: z.array(OpenIssue),
  downgrades: z.array(
    z.object({
      id: z.string(),
      to: z.enum(["pending_validation", "tentative"]),
      reason: z.string(),
    }),
  ),
  additional_limitations: z.array(z.string()),
});

// --- Resumo da reunião (etapa 5b, estrito; docs/AI_PIPELINE.md §3) ---
// Referencia decisões, compromissos e pendências por id: o texto vem da análise.
export const SummaryTopic = z.object({
  title: z.string(), // ≤ 80 caracteres
  summary: z.string(), // 1–3 frases, ≤ 400 caracteres
  source_refs: z.array(SourceRef), // ≥ 1; segment_id/start_ms preenchidos pelo validador
});

export const MeetingSummaryOutput = z.object({
  headline: z.string(), // ≤ 140 caracteres
  executive_summary: z.string(), // ≤ 700 caracteres
  topics: z.array(SummaryTopic), // 3–8, em ordem cronológica
  key_decisions: z.array(z.string()), // ids de decisions "confirmed"
  pending_decisions: z.array(z.string()), // ids de decisions "pending_validation"
  next_steps: z.array(z.string()), // ids de commitments
  open_points: z.array(z.string()), // ids de open_issues
});

export const SummaryMeta = z.object({
  prompt_version: z.string(), // "summarize@1.0"
  model: z.string(),
  generated_at: z.iso.datetime(),
  basis: z.enum(["analysis", "reviewed"]),
});

export const MeetingSummary = MeetingSummaryOutput.extend({ meta: SummaryMeta });

// --- Documento persistido / API ---
export const MeetingAnalysis = ExtractionOutput.extend({
  meeting_id: z.uuid(),
  open_issues: z.array(OpenIssue),
  transcript_metadata: TranscriptMetadata,
  meeting_summary: MeetingSummary.nullable(), // null até a etapa 5b concluir
  review_completed: z.boolean().default(false),
  meta: AnalysisMeta,
});

export type SourceRef = z.infer<typeof SourceRef>;
export type MeetingSummaryOutput = z.infer<typeof MeetingSummaryOutput>;
export type MeetingSummary = z.infer<typeof MeetingSummary>;
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;
export type GapAuditOutput = z.infer<typeof GapAuditOutput>;
export type MeetingAnalysis = z.infer<typeof MeetingAnalysis>;
