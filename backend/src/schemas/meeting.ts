import { z } from "zod";

// Contratos de entrada de Reunião — API_SPEC §4.3.
// Formato (a) JSON textual e (b) multipart áudio (validado na rota, não por Zod).

export const MeetingCreateTextSchema = z.object({
  title: z.string().nullable().optional(),
  transcript_text: z.string().min(1),
  language: z.string().nullable().optional(),
});

export type MeetingCreateText = z.infer<typeof MeetingCreateTextSchema>;

// Extensões/formatos de áudio permitidos (API_SPEC §4.3).
export const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
]);
