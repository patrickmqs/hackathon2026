// Extração best-effort dos dados do projeto (nome, empresa, contato) a partir da transcrição.
// Não faz parte da análise validada: falhar aqui nunca impede a reunião de seguir.
import { z } from "zod";
import { structuredCompletion } from "../../integrations/openai/client.js";
import { loadPrompt } from "./prompts/loader.js";

export const ProjectInfoOutput = z.object({
  project_name: z.string().nullable(),
  client_company: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
});
export type ProjectInfo = z.infer<typeof ProjectInfoOutput>;

export async function extractProjectInfo(transcriptText: string, model?: string): Promise<ProjectInfo> {
  const { data } = await structuredCompletion({
    prompt: loadPrompt("project_info"),
    input: `=== TRANSCRIÇÃO ===\n${transcriptText}`,
    schema: ProjectInfoOutput,
    schemaName: "project_info",
    model,
  });
  return data;
}
