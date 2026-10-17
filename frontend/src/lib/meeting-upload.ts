export const MEETING_UPLOAD_CONFIG = {
  audioExtensions: [".mp3", ".m4a", ".wav"],
  transcriptExtensions: [".txt"],
  documentExtensions: [".docx", ".pdf"],
  audioMaxBytes: 25 * 1024 * 1024,
  textMaxBytes: 400 * 1024,
  transcriptMaxBytes: 400 * 1024,
} as const;

export type MeetingUploadExtension =
  | (typeof MEETING_UPLOAD_CONFIG.audioExtensions)[number]
  | (typeof MEETING_UPLOAD_CONFIG.transcriptExtensions)[number]
  | (typeof MEETING_UPLOAD_CONFIG.documentExtensions)[number];

export function getFileExtension(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
}

export function validateMeetingFile(file: File): string | null {
  const extension = getFileExtension(file.name);
  const allowedExtensions: readonly string[] = [
    ...MEETING_UPLOAD_CONFIG.audioExtensions,
    ...MEETING_UPLOAD_CONFIG.transcriptExtensions,
    ...MEETING_UPLOAD_CONFIG.documentExtensions,
  ];

  if (!allowedExtensions.includes(extension)) {
    return "Formato não suportado. Selecione MP3, M4A, WAV, TXT, DOCX ou PDF.";
  }
  if (file.size === 0) return "O arquivo está vazio.";

  const maxBytes = extension === ".txt"
    ? MEETING_UPLOAD_CONFIG.textMaxBytes
    : MEETING_UPLOAD_CONFIG.audioMaxBytes;

  if (file.size > maxBytes) {
    const maxMb = maxBytes / (1024 * 1024);
    return `O arquivo excede o limite de ${maxMb < 1 ? `${Math.round(maxMb * 1024)} KB` : `${maxMb} MB`}.`;
  }
  return null;
}

export function getFileProcessingMessage(file: File): string | null {
  const extension = getFileExtension(file.name);
  const documentExtensions: readonly string[] = MEETING_UPLOAD_CONFIG.documentExtensions;
  if (documentExtensions.includes(extension)) {
    return "A API atual ainda não processa arquivos PDF ou DOCX. Use áudio, TXT ou cole a transcrição.";
  }
  return null;
}

export function validateTranscript(text: string): string | null {
  if (!text.trim()) return "Cole a transcrição da reunião antes de continuar.";
  if (new TextEncoder().encode(text).length > MEETING_UPLOAD_CONFIG.transcriptMaxBytes) {
    return "A transcrição deve ter no máximo 400 KB.";
  }
  return null;
}

export function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
