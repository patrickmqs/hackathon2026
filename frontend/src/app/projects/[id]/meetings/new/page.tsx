"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import { AppShell, Button, Card } from "@/components/AppShell";
import { ErrorBanner, errorMessage } from "@/components/Api";
import { api, type Meeting } from "@/lib/api";

const STEPS = ["Enviando arquivo", "Transcrevendo", "Analisando e auditando", "Resumindo"];
const MAX_MB = 25;

// índice da etapa ativa a partir do status devolvido pela API
function activeStep(m: Meeting | null, isAudio: boolean): number {
  if (!m) return 0;
  if (m.status === "transcribing") return 1;
  if (m.status === "analyzing") return 2;
  if (m.status === "analysis_ready" || m.status === "reviewed") return 4;
  return isAudio ? 1 : 2;
}

function NewMeetingInner() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<"text" | "audio">("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function poll(id: string) {
    timer.current = setInterval(async () => {
      try {
        const m = await api.getMeeting(id);
        setMeeting(m);
        if (m.status === "analysis_ready" || m.status === "reviewed") {
          if (timer.current) clearInterval(timer.current);
          router.push(`/projects/${projectId}`);
        } else if (m.status === "failed") {
          if (timer.current) clearInterval(timer.current);
          setError(m.error?.message ?? "O processamento falhou.");
        }
      } catch (e) {
        if (timer.current) clearInterval(timer.current);
        setError(errorMessage(e));
      }
    }, 2500);
  }

  async function submit() {
    setError(null);
    if (tab === "text" && text.trim().length < 20) return setError("Cole a transcrição da reunião (mínimo de 20 caracteres).");
    if (tab === "audio" && !file) return setError("Selecione um arquivo de áudio.");
    if (tab === "audio" && file && file.size > MAX_MB * 1024 * 1024) return setError(`O áudio excede ${MAX_MB} MB.`);
    setProcessing(true);
    try {
      const m = tab === "text"
        ? await api.createMeetingText(projectId, { title: title.trim() || undefined, transcript_text: text, language: "pt-BR" })
        : await api.createMeetingAudio(projectId, file!, title.trim() || undefined);
      setMeeting(m);
      poll(m.id);
    } catch (e) {
      setError(errorMessage(e));
      setProcessing(false);
    }
  }

  async function retry() {
    if (!meeting) return;
    setError(null);
    try {
      setMeeting(await api.reprocess(meeting.id));
      poll(meeting.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const step = activeStep(meeting, tab === "audio");
  const failed = meeting?.status === "failed";

  return <AppShell title="Adicionar reunião" eyebrow="PROJETO / NOVA REUNIÃO"><div className="form-layout"><div>
    <Card><h2>Qual é a fonte da reunião?</h2><p>Cole a transcrição ou envie o áudio. A IA cuida do resto.</p>
      <div className="tabs"><button className={tab === "text" ? "active" : ""} onClick={() => setTab("text")} disabled={processing}>☷ Colar transcrição</button><button className={tab === "audio" ? "active" : ""} onClick={() => setTab("audio")} disabled={processing}>◉ Enviar áudio</button></div>
      {tab === "text" ? <div className="form-grid">
        <label>Título<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reunião de descoberta 14/10" /></label>
        <label>Idioma<select><option>Português (Brasil)</option></select></label>
        <label className="full">Transcrição<textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole aqui a transcrição da reunião..." /></label>
      </div> : <div className="stack">
        <label>Título<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reunião de descoberta 14/10" /></label>
        <label className="dropzone"><b>↑</b><strong>{file ? `${file.name} (${(file.size / 1048576).toFixed(1)} MB)` : "Arraste o áudio ou selecione um arquivo"}</strong><p>MP3, M4A, WAV ou WEBM · até {MAX_MB} MB</p>
          <input type="file" accept=".mp3,.m4a,.wav,.webm,audio/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      </div>}
      <ErrorBanner message={error} onRetry={failed ? retry : undefined} />
      <div className="actions"><Button variant="secondary" href={`/projects/${projectId}`}>Cancelar</Button>{!processing && <Button onClick={submit}>Processar reunião →</Button>}</div>
    </Card>
    {processing && <Card><h2>Processando sua reunião</h2><p>Isso normalmente leva cerca de 1 minuto.{meeting?.progress?.message ? ` ${meeting.progress.message}` : ""}</p>
      {STEPS.map((s, i) => <div className={`process ${i === step ? "active" : i < step ? "complete" : ""}`} key={s}><b>{i < step ? "✓" : i === step ? "●" : i + 1}</b>{s}<small>{i < step ? "Concluído" : i === step ? (failed ? "Falhou" : "Em andamento…") : "Aguardando"}</small></div>)}
    </Card>}
  </div><aside className="info"><b>✦</b><h2>O que acontece depois?</h2><p>Vamos separar necessidades, requisitos, decisões, compromissos, pendências e sugestões técnicas, e gerar um resumo da reunião.</p><em>“A IA propõe. Você decide.”</em></aside></div></AppShell>;
}

export default function NewMeeting() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><NewMeetingInner /></Suspense>;
}
