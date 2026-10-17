// Schema da proposta — versão 1.0 (docs/AI_PIPELINE.md §8).
// `ProposalContent` é o conteúdo completo; `ProposalTextOutput` é a saída do LLM #3
// (estrita: todo campo obrigatório, `.nullable()` no lugar de `.optional()`, sem `.default()`, sem z.record).
import { z } from "zod";
import { Confidence } from "./analysis.js";

export const Party = z.object({
  company: z.string(),
  contact_name: z.string().nullable(),
  contact_email: z.email().nullable(),
  contact_phone: z.string().nullable(),
});

export const Vendor = z.object({
  company: z.string(),
  contact_name: z.string().nullable(),
  contact_email: z.string().nullable(),
  website: z.string().nullable(),
  is_demo_profile: z.boolean(),
});

export const ProposalModule = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  features: z.array(z.string()),
  complexity: z.enum(["S", "M", "L", "XL"]),
  source_requirement_ids: z.array(z.string()),
});

export const ArchitectureSection = z.object({
  overview: z.string(),
  components: z.array(z.object({ name: z.string(), responsibility: z.string() })),
  technologies: z.array(z.object({ layer: z.string(), choice: z.string(), rationale: z.string() })),
  diagram_mermaid: z.string().nullable(),
  is_ai_suggestion: z.literal(true), // SEMPRE true no MVP; renderizado com rótulo
});

export const Profile = z.enum(["backend_dev", "frontend_dev", "qa", "ux", "pm", "devops"]);

export const EstimateLine = z.object({
  module_id: z.string(),
  profile: Profile,
  hours_min: z.number().int(),
  hours_max: z.number().int(),
  rationale: z.string().nullable(), // P1
});

export const Estimates = z.object({
  method: z.string(), // "rules_v1 + historical_demo"
  basis_label: z.string(),
  lines: z.array(EstimateLine),
  totals_by_profile: z.record(Profile, z.object({ hours_min: z.number().int(), hours_max: z.number().int() })),
  total_hours_min: z.number().int(),
  total_hours_max: z.number().int(),
  confidence: Confidence,
  assumptions: z.array(z.string()),
});

export const TeamPhase = z.object({
  phase: z.string(),
  duration_weeks: z.number().int(),
  roles: z.array(z.object({ profile: Profile, allocation_pct: z.number().int(), count: z.number().int() })),
});

export const SchedulePhase = z.object({
  name: z.string(),
  duration_weeks: z.number().int(),
  depends_on: z.array(z.string()),
  deliverables: z.array(z.string()),
});

export const Commercial = z
  .object({
    status: z.enum(["not_provided", "demo_rates", "provided"]),
    currency: z.string().nullable(),
    hourly_rates: z.record(Profile, z.number()).nullable(),
    total_min: z.number().nullable(),
    total_max: z.number().nullable(),
    payment_terms: z.string().nullable(),
    validity_days: z.number().int().nullable(),
    disclaimer: z.string().nullable(), // obrigatório se demo_rates (refine)
  })
  .refine((c) => c.status !== "demo_rates" || !!c.disclaimer, { message: "disclaimer obrigatório em demo_rates" });

export const ProposalMeta = z.object({
  version: z.number().int(),
  revision_label: z.enum(["rascunho", "aprovada"]),
  created_at: z.iso.datetime(),
  language: z.string(),
  source_meeting_id: z.uuid(),
  source_analysis_prompt_version: z.string(),
});

const RequirementItem = z.object({ title: z.string(), description: z.string(), type: z.string() });
const RiskItem = z.object({ description: z.string(), mitigation: z.string() });
const OpenPointItem = z.object({ description: z.string(), question: z.string() });
const Scope = z.object({ in_scope: z.array(z.string()), out_of_scope: z.array(z.string()) });

export const ProposalContent = z.object({
  schema_version: z.literal("1.0"),
  title: z.string(),
  client: Party, // 1
  vendor: Vendor,
  executive_summary: z.string(), // 2
  business_context: z.string(), // 3
  objectives: z.array(z.string()), // 4
  scope: Scope, // 5
  modules: z.array(ProposalModule), // 6
  requirements_and_integrations: z.array(RequirementItem), // 7
  architecture: ArchitectureSection, // 8
  assumptions: z.array(z.string()), // 9
  dependencies: z.array(z.string()),
  exclusions: z.array(z.string()),
  estimates: Estimates, // 10
  team: z.array(TeamPhase), // 11
  schedule: z.array(SchedulePhase), // 12
  total_weeks: z.number().int(),
  risks: z.array(RiskItem), // 13
  open_points: z.array(OpenPointItem),
  commercial: Commercial, // 14
  next_steps: z.array(z.string()), // 15
  meta: ProposalMeta, // 16
});

// --- Saída do LLM #3 (estrita): só os campos textuais ---
// O builder injeta client, vendor, estimates, team, schedule, total_weeks, commercial e meta.
export const ProposalTextOutput = z.object({
  title: z.string(),
  executive_summary: z.string(),
  business_context: z.string(),
  objectives: z.array(z.string()),
  scope: Scope,
  // `id` identifica o módulo (vem da entrada); o composer só preenche description e features.
  modules: z.array(z.object({ id: z.string(), description: z.string(), features: z.array(z.string()) })),
  requirements_and_integrations: z.array(RequirementItem),
  architecture: z.object({
    overview: z.string(),
    components: z.array(z.object({ name: z.string(), responsibility: z.string() })),
    technologies: z.array(z.object({ layer: z.string(), choice: z.string(), rationale: z.string() })),
    diagram_mermaid: z.string().nullable(),
  }),
  assumptions: z.array(z.string()),
  dependencies: z.array(z.string()),
  exclusions: z.array(z.string()),
  risks: z.array(RiskItem),
  open_points: z.array(OpenPointItem),
  next_steps: z.array(z.string()),
});

export type Party = z.infer<typeof Party>;
export type Vendor = z.infer<typeof Vendor>;
export type ProposalModule = z.infer<typeof ProposalModule>;
export type ArchitectureSection = z.infer<typeof ArchitectureSection>;
export type Profile = z.infer<typeof Profile>;
export type EstimateLine = z.infer<typeof EstimateLine>;
export type Estimates = z.infer<typeof Estimates>;
export type TeamPhase = z.infer<typeof TeamPhase>;
export type SchedulePhase = z.infer<typeof SchedulePhase>;
export type Commercial = z.infer<typeof Commercial>;
export type ProposalMeta = z.infer<typeof ProposalMeta>;
export type ProposalContent = z.infer<typeof ProposalContent>;
export type ProposalTextOutput = z.infer<typeof ProposalTextOutput>;
