import { z } from "zod";
import { Confidence } from "./common.js";

// Schemas da proposta — AI_PIPELINE §8 (ProposalContent).

const Party = z.object({
  company: z.string(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
});

const Vendor = z.object({
  company: z.string(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  is_demo_profile: z.boolean().default(true),
});

const ProposalModule = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  features: z.array(z.string()),
  complexity: z.enum(["S", "M", "L", "XL"]),
  source_requirement_ids: z.array(z.string()),
});

const ArchitectureSection = z.object({
  overview: z.string(),
  components: z.array(z.object({ name: z.string(), responsibility: z.string() })),
  technologies: z.array(
    z.object({ layer: z.string(), choice: z.string(), rationale: z.string() }),
  ),
  diagram_mermaid: z.string().nullable().optional(),
  is_ai_suggestion: z.boolean().default(true),
});

const EstimateLine = z.object({
  module_id: z.string(),
  profile: z.string(),
  hours_min: z.number().int(),
  hours_max: z.number().int(),
  rationale: z.string().nullable().optional(),
});

const Estimates = z.object({
  method: z.string(),
  basis_label: z.string(),
  lines: z.array(EstimateLine),
  totals_by_profile: z.record(
    z.string(),
    z.object({ hours_min: z.number().int(), hours_max: z.number().int() }),
  ),
  total_hours_min: z.number().int(),
  total_hours_max: z.number().int(),
  confidence: Confidence,
  assumptions: z.array(z.string()),
});

const TeamPhase = z.object({
  phase: z.string(),
  duration_weeks: z.number().int(),
  roles: z.array(
    z.object({ profile: z.string(), allocation_pct: z.number(), count: z.number().int() }),
  ),
});

const SchedulePhase = z.object({
  name: z.string(),
  duration_weeks: z.number().int(),
  depends_on: z.array(z.string()),
  deliverables: z.array(z.string()),
});

const Commercial = z.object({
  status: z.enum(["not_provided", "demo_rates", "provided"]),
  currency: z.string().nullable().optional(),
  hourly_rates: z.record(z.string(), z.number()).nullable().optional(),
  total_min: z.number().nullable().optional(),
  total_max: z.number().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  validity_days: z.number().int().nullable().optional(),
  disclaimer: z.string().nullable().optional(),
});

const ProposalMeta = z.object({
  version: z.number().int(),
  revision_label: z.string(),
  created_at: z.string(),
  language: z.string(),
  source_meeting_id: z.string(),
  source_analysis_prompt_version: z.string(),
});

export const ProposalContentSchema = z.object({
  schema_version: z.string().default("1.0"),
  title: z.string(),
  client: Party,
  vendor: Vendor,
  executive_summary: z.string(),
  business_context: z.string(),
  objectives: z.array(z.string()),
  scope: z.object({ in_scope: z.array(z.string()), out_of_scope: z.array(z.string()) }),
  modules: z.array(ProposalModule),
  requirements_and_integrations: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      type: z.enum(["functional", "non_functional", "integration"]),
    }),
  ),
  architecture: ArchitectureSection,
  assumptions: z.array(z.string()),
  dependencies: z.array(z.string()),
  exclusions: z.array(z.string()),
  estimates: Estimates,
  team: z.array(TeamPhase),
  schedule: z.array(SchedulePhase),
  total_weeks: z.number().int(),
  risks: z.array(z.object({ description: z.string(), mitigation: z.string() })),
  open_points: z.array(z.object({ description: z.string(), question: z.string() })),
  commercial: Commercial,
  next_steps: z.array(z.string()),
  meta: ProposalMeta,
});

export type ProposalContent = z.infer<typeof ProposalContentSchema>;
