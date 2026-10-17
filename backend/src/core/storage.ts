import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// FileStorage — grava áudio e PDFs em disco (ARCHITECTURE §9).
// Áudio:   {storageDir}/audio/{meetingId}.{ext}
// PDF:     {storageDir}/pdfs/{proposalId}/v{number}.pdf
// Nada é servido por diretório estático; os endpoints leem via este serviço.
export class FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private ensureDir(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
  }

  saveAudio(meetingId: string, extension: string, buffer: Buffer): string {
    const ext = extension.replace(/^\./, "");
    const path = resolve(this.root, "audio", `${meetingId}.${ext}`);
    this.ensureDir(path);
    writeFileSync(path, buffer);
    return path;
  }

  savePdf(proposalId: string, versionNumber: number, buffer: Buffer): string {
    const path = resolve(this.root, "pdfs", proposalId, `v${versionNumber}.pdf`);
    this.ensureDir(path);
    writeFileSync(path, buffer);
    return path;
  }

  read(path: string): Buffer {
    return readFileSync(path);
  }

  audioPath(meetingId: string, extension: string): string {
    const ext = extension.replace(/^\./, "");
    return resolve(this.root, "audio", `${meetingId}.${ext}`);
  }
}
