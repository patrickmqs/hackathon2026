import { api, type Meeting } from "@/lib/api";
import { getFileExtension, validateTranscript } from "@/lib/meeting-upload";

export type MeetingSource = { kind: "file"; file: File } | { kind: "text"; text: string };

// A tela inicial só valida e navega na hora; a criação do projeto e o envio da reunião rodam
// na tela de processamento (rota /meetings/pending/processing), que mostra o progresso desde o primeiro instante.
let pending: { source: MeetingSource; promise: Promise<Meeting> | null } | null = null;

async function startMeeting(source: MeetingSource): Promise<Meeting> {
  // O projeto nasce sem dados: a IA preenche nome e empresa a partir da reunião.
  const project = await api.createProject({});
  if (source.kind === "text") {
    return api.createMeetingText(project.id, { transcript_text: source.text, language: "pt-BR" });
  }
  if (getFileExtension(source.file.name) === ".txt") {
    const text = await source.file.text();
    const validationError = validateTranscript(text);
    if (validationError) throw new Error(validationError);
    return api.createMeetingText(project.id, { transcript_text: text.trim(), language: "pt-BR" });
  }
  return api.createMeetingAudio(project.id, source.file);
}

export function setPendingMeeting(source: MeetingSource) {
  pending = { source, promise: null };
}

export function hasPendingMeeting() {
  return pending !== null;
}

/**
 * Dispara o envio uma única vez (seguro contra efeitos duplicados); em erro, permite nova tentativa.
 * Depois de concluído, continua devolvendo a mesma reunião (não limpa o estado): se o efeito da tela
 * rodar de novo antes da troca de rota, ele não confunde "já enviado" com "nada pendente" e não volta ao início.
 */
export function launchPendingMeeting(): Promise<Meeting> | null {
  if (!pending) return null;
  const current = pending;
  current.promise ??= startMeeting(current.source).then(
    (meeting) => meeting,
    (error) => {
      current.promise = null;
      throw error;
    },
  );
  return current.promise;
}
