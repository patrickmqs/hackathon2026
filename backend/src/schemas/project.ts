import { z } from "zod";

// Contratos de entrada/saída de Projeto — API_SPEC §4.2.

/** Valores provisórios quando o projeto nasce de uma reunião: a IA ou o usuário preenchem depois. */
export const PLACEHOLDER_PROJECT_NAME = "Projeto sem nome";
export const PLACEHOLDER_COMPANY = "Cliente a definir";

export const ProjectClientSchema = z.object({
  company: z.string().min(1),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
});

// Nome e empresa são opcionais na criação: sem eles o projeto recebe os valores provisórios.
export const ProjectCreateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  client: ProjectClientSchema.partial().optional(),
});

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  client: ProjectClientSchema.partial().optional(),
});

export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
export type ProjectClient = z.infer<typeof ProjectClientSchema>;
