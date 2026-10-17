import { DomainError } from "../../core/errors.js";
import type { FileStorage } from "../../core/storage.js";
import type { MeetingRecord, Repository } from "../../repositories/repo.js";
import type { MeetingCreateText } from "../../schemas/meeting.js";

// Criação de reunião — B4. Decide o estado inicial conforme a origem (domain/meeting):
//   texto → analyzing (receive_text); áudio → transcribing (receive_audio).
// A transcrição/extração em si é responsabilidade do orquestrador (B5).

const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

export interface AudioUpload {
  buffer: Buffer;
  mimetype: string;
}

export async function createMeetingFromText(
  repo: Repository,
  projectId: string,
  input: MeetingCreateText,
): Promise<MeetingRecord> {
  await assertProjectExists(repo, projectId);
  const meeting = await repo.createMeeting({
    projectId,
    sourceType: "text",
    status: "analyzing",
    title: input.title ?? null,
    audioPath: null,
  });
  // O texto já está disponível; armazenamos o transcript para o pipeline de análise.
  await repo.createTranscript({
    meetingId: meeting.id,
    text: input.transcript_text,
    segments: [],
    metadata: { language: input.language ?? null, source_type: "text" },
  });
  return meeting;
}

export async function createMeetingFromAudio(
  repo: Repository,
  storage: FileStorage,
  projectId: string,
  file: AudioUpload,
  title: string | null,
  language: string | null,
): Promise<MeetingRecord> {
  await assertProjectExists(repo, projectId);
  const ext = EXT_BY_MIME[file.mimetype];
  if (!ext) {
    throw new DomainError("UPLOAD_INVALID", "Formato de áudio não suportado.");
  }
  const meeting = await repo.createMeeting({
    projectId,
    sourceType: "audio",
    status: "transcribing",
    title,
    audioPath: null,
  });
  const path = storage.saveAudio(meeting.id, ext, file.buffer);
  const updated = await repo.updateMeeting(meeting.id, { audioPath: path });
  return updated ?? meeting;
}

async function assertProjectExists(repo: Repository, projectId: string): Promise<void> {
  const project = await repo.getProject(projectId);
  if (!project) {
    throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  }
}
