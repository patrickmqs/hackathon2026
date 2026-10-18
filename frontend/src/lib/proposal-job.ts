import { api } from "@/lib/api";

// A proposta é gerada em paralelo: a tela de processamento dispara o rascunho assim que a análise
// fica pronta (sem esperar), e as telas seguintes reaproveitam o que estiver em andamento.
const inflight = new Map<string, Promise<string>>();

/** Devolve o id da proposta do projeto: a existente, a que está sendo gerada ou uma nova. */
export function ensureProposal(projectId: string, meetingId: string): Promise<string> {
  const running = inflight.get(meetingId);
  if (running) return running;
  const job = (async () => {
    const project = await api.getProject(projectId);
    if (project.latest_proposal_id) return project.latest_proposal_id;
    return (await api.createProposal(projectId, meetingId)).id;
  })().finally(() => inflight.delete(meetingId));
  inflight.set(meetingId, job);
  return job;
}

/** Gera uma proposta nova (a mais recente passa a valer), depois de qualquer geração em andamento. */
export async function regenerateProposal(projectId: string, meetingId: string): Promise<string> {
  await inflight.get(meetingId)?.catch(() => undefined);
  return (await api.createProposal(projectId, meetingId)).id;
}
