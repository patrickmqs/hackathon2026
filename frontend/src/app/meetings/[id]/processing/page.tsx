"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import { AppShell, Card } from "@/components/AppShell";
import { ErrorBanner, Loading, errorMessage } from "@/components/Api";
import { api, type Analysis, type Meeting } from "@/lib/api";
import "./processing.css";

const AUDIO_STEPS = [
  { key: "created", label: "Arquivo recebido", detail: "Seu áudio foi enviado e está pronto para processamento." },
  { key: "transcribing", label: "Transcrevendo", detail: "A IA está convertendo o áudio em texto para extrair os principais pontos." },
  { key: "analyzing", label: "Analisando", detail: "Estamos identificando necessidades, requisitos, decisões e pendências." },
  { key: "analysis_ready", label: "Resumo pronto", detail: "A análise final está pronta para revisão e aprovação." },
] as const;

const TEXT_STEPS = [
  { key: "created", label: "Transcrição recebida", detail: "Sua transcrição foi registrada no sistema." },
  { key: "analyzing", label: "Analisando", detail: "A IA está identificando necessidades, requisitos, decisões e pendências." },
  { key: "analysis_ready", label: "Resumo pronto", detail: "A análise final está pronta para revisão e aprovação." },
] as const;

// Atividades típicas de cada fase. O backend só informa a fase atual; estas linhas descrevem o
// trabalho da fase e vão aparecendo conforme o tempo passa.
const PHASE_ACTIVITY: Record<string, string[]> = {
  created: ["Validando o formato do material…", "Registrando a reunião no projeto…"],
  transcribing: ["Convertendo o áudio em texto…", "Separando falas e interlocutores…", "Ajustando pontuação e termos técnicos…", "Conferindo trechos com baixa clareza…"],
  analyzing: [
    "Identificando os principais temas da conversa…",
    "Extraindo requisitos e funcionalidades…",
    "Separando decisões de sugestões…",
    "Mapeando integrações mencionadas…",
    "Identificando pendências e pontos de confirmação…",
    "Relacionando cada item ao trecho da reunião…",
    "Escrevendo o resumo executivo…",
  ],
  analysis_ready: ["Conferindo se a análise está completa…", "Preparando a tela de revisão…"],
};

type LogEntry = { id: number; time: string; text: string };

function clock() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function getStepIndex(meeting: Meeting | null, sourceType: Meeting["source_type"]) {
  if (!meeting) return 0;
  const steps = sourceType === "audio" ? AUDIO_STEPS : TEXT_STEPS;
  const currentIndex = steps.findIndex((step) => step.key === meeting.status);
  if (currentIndex >= 0) return currentIndex;
  if (meeting.status === "reviewed") return steps.length - 1;
  if (meeting.status === "failed") return steps.length - 1;
  return 0;
}

function getStatusMessage(
  meeting: Meeting | null,
  sourceType: Meeting["source_type"],
  analysisVerified: boolean,
) {
  if (!meeting) {
    return sourceType === "audio" ? "Preparando o processamento do áudio…" : "Preparando a análise da transcrição…";
  }
  if (meeting.status === "failed") {
    return meeting.error?.message ?? "Não foi possível concluir o processamento.";
  }
  if (meeting.status === "analysis_ready" || meeting.status === "reviewed") {
    return analysisVerified
      ? "Sua análise está pronta. Redirecionando para revisão…"
      : "Conferindo se a análise já está disponível…";
  }
  return meeting.progress?.message || "Processando sua reunião…";
}

function MeetingProcessingPageInner() {
  const { id: meetingId } = useParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisVerified, setAnalysisVerified] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function syncMeeting() {
      try {
        const current = await api.getMeeting(meetingId);
        if (!active) return;

        setMeeting(current);
        setError(null);

        if (current.status === "analysis_ready" || current.status === "reviewed") {
          let analysis: Analysis;
          try {
            analysis = await api.getAnalysis(meetingId);
          } catch (requestError) {
            if (!active) return;
            setError(errorMessage(requestError));
            setLoading(false);
            timer = setTimeout(syncMeeting, 2500);
            return;
          }
          if (!analysis.meeting_summary) {
            setError("O resumo da reunião não foi gerado. Tente processar novamente.");
            setLoading(false);
            return;
          }
          if (!active) return;
          setAnalysisVerified(true);
          router.replace(`/meetings/${meetingId}/analysis`);
          return;
        }

        if (current.status === "failed") {
          setLoading(false);
          return;
        }

        setLoading(false);
        timer = setTimeout(syncMeeting, 2500);
      } catch (requestError) {
        if (!active) return;
        setError(errorMessage(requestError));
        setLoading(false);
      }
    }

    void syncMeeting();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [meetingId, pollVersion, router]);

  const sourceType = meeting?.source_type ?? "audio";
  const steps = sourceType === "audio" ? AUDIO_STEPS : TEXT_STEPS;
  const currentStep = getStepIndex(meeting, sourceType);
  const isFailed = meeting?.status === "failed";
  const canRetry = Boolean(meeting && (
    isFailed ||
    ((meeting.status === "analysis_ready" || meeting.status === "reviewed") && !analysisVerified && error)
  ));

  async function retryProcessing() {
    if (!meeting || retrying) return;
    setRetrying(true);
    setError(null);
    try {
      await api.reprocess(meetingId);
      setAnalysisVerified(false);
      setPollVersion((version) => version + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setRetrying(false);
    }
  }

  const stepKey: string = steps[currentStep]?.key ?? "created";
  const done = analysisVerified;
  const hasMeeting = Boolean(meeting);
  const progressMessage = meeting?.progress?.message;

  // Cronômetro desde a abertura da tela.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (done || isFailed) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [done, isFailed]);

  // Log em tempo real: a mensagem real do backend entra na hora; as atividades da fase, aos poucos.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const logBody = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done || isFailed || !hasMeeting) return;
    const push = (text: string) => setLog((list) => (
      list[list.length - 1]?.text === text ? list : [...list, { id: logId.current++, time: clock(), text }]
    ));
    if (progressMessage) push(progressMessage);
    const lines = PHASE_ACTIVITY[stepKey] ?? [];
    let index = 0;
    const timer = setInterval(() => {
      if (index < lines.length) push(lines[index++]);
      else clearInterval(timer);
    }, 2200);
    return () => clearInterval(timer);
  }, [stepKey, progressMessage, done, isFailed, hasMeeting]);

  useEffect(() => {
    logBody.current?.scrollTo({ top: logBody.current.scrollHeight, behavior: "smooth" });
  }, [log.length, done]);

  // Progresso: base da etapa + avanço suave dentro dela (não passa de 96% até concluir).
  const span = 100 / steps.length;
  const base = currentStep * span;
  const percent = done
    ? 100
    : isFailed
      ? Math.round(base)
      : Math.min(96, Math.round(base + span * 0.9 * (1 - Math.exp(-elapsed / 40))));
  const stageTitle = done ? "Análise pronta" : isFailed ? "Processo interrompido" : steps[currentStep].label;
  const stageText = done ? "Redirecionando para a revisão…" : getStatusMessage(meeting, sourceType, analysisVerified);

  return (
    <AppShell title="Processando reunião" eyebrow="REUNIÃO / ANÁLISE">
      {loading && !meeting ? (
        <Loading text="Preparando a reunião…" />
      ) : (
        <div className="proc">
          <header className="proc-head">
            <span className={`proc-pill${isFailed ? " failed" : ""}`}><i />{isFailed ? "Falhou" : done ? "Concluído" : "Em processamento"}</span>
            <h1>Transformando sua reunião em proposta</h1>
            <p>Estamos analisando o conteúdo da reunião e estruturando uma análise completa com o apoio da IA. Essa etapa pode levar alguns minutos.</p>
          </header>

          <ErrorBanner message={error ?? (isFailed ? meeting?.error?.message ?? null : null)} />

          <div className="proc-grid">
            <Card className="proc-steps">
              <ol>
                {steps.map((step, index) => {
                  const complete = index < currentStep || done;
                  const active = index === currentStep && !done && !isFailed;
                  return (
                    <li key={step.key} className={complete ? "complete" : active ? "active" : ""}>
                      <span className="proc-node">{complete ? "✓" : index + 1}</span>
                      <div>
                        <strong>{index + 1}. {step.label}</strong>
                        <small>{step.detail}</small>
                        {active && <em>Em andamento</em>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>

            <div className="proc-orb-wrap" aria-live="polite">
              <div className={`proc-orb${done ? " done" : ""}${isFailed ? " failed" : ""}`}>
                <span className="ring r1" /><span className="ring r2" /><span className="spinner" />
                <span className="core">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {done
                      ? <path d="M5 12.5l4.5 4.5L19 7.5" />
                      : isFailed
                        ? <path d="M6 6l12 12M18 6L6 18" />
                        : <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3.2" /></>}
                  </svg>
                </span>
                {!done && !isFailed && [0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`orbit-dot o${i}`} />)}
              </div>
              <h2>{stageTitle}</h2>
              <p>{stageText}</p>
              {canRetry && (
                <button type="button" className="button primary" onClick={() => void retryProcessing()} disabled={retrying}>
                  {retrying ? "Reiniciando análise…" : "Tentar novamente"}
                </button>
              )}
            </div>

            <Card className="proc-log">
              <div className="proc-log-head">
                <h2>Processo em tempo real</h2>
                <span className={done || isFailed ? "idle" : "live"}><i />{done ? "Concluído" : isFailed ? "Parado" : "Atualizando"}</span>
              </div>
              <div className="proc-log-body" ref={logBody}>
                {log.length === 0 && <p className="proc-log-empty">Aguardando as primeiras atividades…</p>}
                {log.map((entry, index) => (
                  <p key={entry.id} className={`proc-log-row${index === log.length - 1 && !done && !isFailed ? " current" : ""}`}>
                    <time>{entry.time}</time><i /><span>{entry.text}</span>
                  </p>
                ))}
                {done && <p className="proc-log-row"><time>{clock()}</time><i /><span>Análise concluída. Abrindo a revisão…</span></p>}
              </div>
            </Card>
          </div>

          <Card className="proc-bar">
            <span className="proc-file" aria-hidden="true">{sourceType === "audio" ? "♪" : "TXT"}</span>
            <div className="proc-file-info">
              <strong>{meeting?.title ?? (sourceType === "audio" ? "Áudio da reunião" : "Transcrição da reunião")}</strong>
              <small>{sourceType === "audio" ? "Áudio" : "Transcrição"} · {formatElapsed(elapsed)} de processamento</small>
            </div>
            <div className="proc-progress">
              <span>Etapa atual: <b>{stageTitle}</b></span>
              <div className="track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div>
            </div>
            <b className="proc-percent">{percent}%</b>
          </Card>

          <div className="proc-actions">
            <button type="button" className="button secondary" onClick={() => router.push(`/projects/${meeting?.project_id ?? ""}`)} disabled={!meeting}>
              Voltar ao projeto
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function MeetingProcessingPage() {
  return (
    <Suspense fallback={<AppShell title="Carregando…" eyebrow="REUNIÃO / ANÁLISE"><Loading text="Carregando processamento…" /></AppShell>}>
      <MeetingProcessingPageInner />
    </Suspense>
  );
}