import { z } from "zod";

// Contratos de entrada/saída de Projeto — API_SPEC §4.2.

export const ProjectClientSchema = z.object({
  company: z.string().min(1),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
});

export const ProjectCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  client: ProjectClientSchema,
});

export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;
export type ProjectClient = z.infer<typeof ProjectClientSchema>;
