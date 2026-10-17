"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Meeting } from "@/lib/api";
import { errorMessage } from "@/components/Api";
import {
  formatFileSize,
  getFileExtension,
  getFileProcessingMessage,
  MEETING_UPLOAD_CONFIG,
  validateMeetingFile,
  validateTranscript,
} from "@/lib/meeting-upload";
import { Card } from "@/components/AppShell";

type MeetingSource =
  | { kind: "file"; file: File }
  | { kind: "text"; text: string };

export function MeetingIntake() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [source, setSource] = useState<MeetingSource | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (showTranscript && !dialog.open) dialog.showModal();
    if (!showTranscript && dialog.open) dialog.close();
  }, [showTranscript]);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  // Com cacheComponents o Next mantém esta tela viva (oculta) ao navegar e a restaura com o estado
  // antigo (arquivo enviado, "analisando…", botões travados). Os efeitos reativam toda vez que a tela
  // volta a ser exibida, então é aqui que recomeçamos limpos para permitir uma nova reunião.
  /* eslint-disable react-hooks/set-state-in-effect -- reset intencional ao reexibir a tela */
  useEffect(() => {
    setSource(null);
    setSourceError(null);
    setError(null);
    setBusy(false);
    setStatusText("");
    setCreatedProjectId(null);
    setShowTranscript(false);
    setTranscriptDraft("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function chooseFiles(files: FileList | File[]) {
    setError(null);
    setSourceError(null);
    if (files.length > 1) {
      setSource(null);
      setSourceError("O processamento atual aceita um arquivo por reunião. Selecione apenas um.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const file = files[0];
    if (!file) return;
    setSource({ kind: "file", file });
    setSourceError(validateMeetingFile(file));
  }

  function removeSource() {
    setSource(null);
    setSourceError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function continueWithTranscript() {
    const validationError = validateTranscript(transcriptDraft);
    if (validationError) {
      setSourceError(validationError);
      return;
    }
    setSource({ kind: "text", text: transcriptDraft.trim() });
    setSourceError(null);
    setError(null);
    setShowTranscript(false);
  }

  function cancelTranscript() {
    setShowTranscript(false);
    setSourceError(null);
  }

  async function analyzeMeeting() {
    if (busy || !source) return;
    setError(null);
    setSourceError(null);

    if (source.kind === "file") {
      const validationError = validateMeetingFile(source.file);
      if (validationError) {
        setSourceError(validationError);
        return;
      }
      const processingMessage = getFileProcessingMessage(source.file);
      if (processingMessage) {
        setSourceError(processingMessage);
        return;
      }
    } else {
      const validationError = validateTranscript(source.text);
      if (validationError) {
        setSourceError(validationError);
        return;
      }
    }

    setBusy(true);
    setStatusText("Preparando a análise…");
    try {
      // O projeto nasce sem dados: a IA preenche nome e empresa a partir da reunião e o que
      // faltar o usuário completa depois, na página do projeto.
      let projectId = createdProjectId;
      if (!projectId) {
        const project = await api.createProject({});
        projectId = project.id;
        setCreatedProjectId(project.id);
      }

      setStatusText("Enviando a reunião…");
      let meeting: Meeting;
      if (source.kind === "text") {
        meeting = await api.createMeetingText(projectId, {
          transcript_text: source.text,
          language: "pt-BR",
        });
      } else if (getFileExtension(source.file.name) === ".txt") {
        const text = await source.file.text();
        const validationError = validateTranscript(text);
        if (validationError) throw new Error(validationError);
        meeting = await api.createMeetingText(projectId, {
          transcript_text: text.trim(),
          language: "pt-BR",
        });
      } else {
        meeting = await api.createMeetingAudio(projectId, source.file);
      }
      setStatusText(meeting.progress?.message || "Reunião recebida. Iniciando análise…");
      router.push(`/meetings/${meeting.id}/processing`);
      return;
    } catch (requestError) {
      setError(errorMessage(requestError));
      setBusy(false);
      setStatusText("");
    }
  }

  const file = source?.kind === "file" ? source.file : null;
  const fileProcessingMessage = file ? getFileProcessingMessage(file) : null;
  const acceptedExtensions = [
    ...MEETING_UPLOAD_CONFIG.audioExtensions,
    ...MEETING_UPLOAD_CONFIG.transcriptExtensions,
    ...MEETING_UPLOAD_CONFIG.documentExtensions,
  ].join(",");

  return <>
    <Card className="meeting-intake">
      <div className="card-heading">
        <div>
          <h2>Comece por uma reunião</h2>
          <p>Envie o áudio ou a transcrição para gerar sua proposta comercial e técnica com o apoio da IA.</p>
        </div>
        <span className="intake-spark" aria-hidden="true">✦</span>
      </div>

      <div
        className={`meeting-dropzone${dragging ? " is-dragging" : ""}${source ? " has-source" : ""}${sourceError ? " has-error" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          chooseFiles(event.dataTransfer.files);
        }}
      >
        <span className="upload-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4h14v-4" />
          </svg>
        </span>
        <strong>Arraste seus arquivos para cá</strong>
        <small>MP3, M4A, WAV, TXT, DOCX ou PDF · áudio até 25 MB · TXT até 400 KB</small>
        <input
          ref={inputRef}
          type="file"
          accept={acceptedExtensions}
          className="visually-hidden"
          aria-label="Selecionar arquivo de áudio ou transcrição"
          onChange={(event) => chooseFiles(event.currentTarget.files ?? [])}
        />
        <button className="button primary select-file-button" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          Selecionar arquivos
        </button>
      </div>

      {file && <div className={`selected-file${sourceError ? " invalid" : ""}`} aria-live="polite">
        <span className="file-type" aria-hidden="true">{getFileExtension(file.name).slice(1).toUpperCase()}</span>
        <span className="selected-file-info">
          <strong title={file.name}>{file.name}</strong>
          <small>{getFileExtension(file.name).slice(1).toUpperCase()} · {formatFileSize(file.size)}</small>
        </span>
        <span className="file-validation">{sourceError ? "Verifique o arquivo" : fileProcessingMessage ? "Integração pendente" : "Pronto para analisar"}</span>
        <button type="button" className="remove-file" onClick={removeSource} disabled={busy} aria-label={`Remover ${file.name}`}>×</button>
      </div>}
      {source?.kind === "text" && <div className="selected-file" aria-live="polite">
        <span className="file-type" aria-hidden="true">TXT</span>
        <span className="selected-file-info"><strong>Transcrição colada</strong><small>{source.text.length.toLocaleString("pt-BR")} caracteres</small></span>
        <span className="file-validation">Pronta para analisar</span>
        <button type="button" className="remove-file" onClick={removeSource} disabled={busy} aria-label="Remover transcrição">×</button>
      </div>}
      {sourceError && !showTranscript && <p className="intake-message error" role="alert">{sourceError}</p>}

      <button className="button secondary paste-transcript" type="button" onClick={() => { setTranscriptDraft(""); setSourceError(null); setShowTranscript(true); }} disabled={busy}>
        Colar transcrição
      </button>

      {error && <p className="intake-message error" role="alert">{error}</p>}
      {fileProcessingMessage && <p className="intake-message info">{fileProcessingMessage}</p>}
      {statusText && <p className="intake-message progress" role="status" aria-live="polite">{statusText}</p>}
      <button className="button primary analyze-meeting" type="button" onClick={() => void analyzeMeeting()} disabled={busy || !source}>
        {busy ? "Analisando reunião…" : "Analisar reunião"}
      </button>
      <p className="intake-footnote">A seleção não envia o arquivo. O envio começa somente quando você clicar em “Analisar reunião”.</p>
    </Card>

    {showTranscript && <dialog ref={dialogRef} className="intake-modal" aria-labelledby="transcript-dialog-title"
      onCancel={(event) => { event.preventDefault(); cancelTranscript(); }}
      onClose={cancelTranscript}
      onClick={(event) => { if (event.target === event.currentTarget) cancelTranscript(); }}>
        <div className="card-heading">
          <div><h2 id="transcript-dialog-title">Adicionar transcrição</h2><p>Cole a conversa para preparar a análise da reunião.</p></div>
          <button type="button" className="remove-file" onClick={cancelTranscript} aria-label="Fechar">×</button>
        </div>
        <label htmlFor="meeting-transcript">Transcrição</label>
        <textarea
          id="meeting-transcript"
          rows={12}
          value={transcriptDraft}
          onChange={(event) => { setTranscriptDraft(event.target.value); setSourceError(null); }}
          placeholder="Cole aqui a transcrição da reunião com o cliente..."
          autoFocus
        />
        {sourceError && <p className="intake-message error" role="alert">{sourceError}</p>}
        <div className="intake-modal-actions">
          <button className="button secondary" type="button" onClick={cancelTranscript}>Cancelar</button>
          <button className="button primary" type="button" onClick={continueWithTranscript}>Continuar</button>
        </div>
    </dialog>}
  </>;
}
