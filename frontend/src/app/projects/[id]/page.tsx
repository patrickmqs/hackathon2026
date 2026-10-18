"use client";
import { Fragment, Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, Badge, Button } from "@/components/AppShell";
import { ErrorBanner, Loading, errorMessage, useLoad } from "@/components/Api";
import { ProjectDetailsForm } from "@/components/ProjectDetailsForm";
import { ensureProposal } from "@/lib/proposal-job";
import { STATUS_LABEL, api, timeAgo, type Analysis, type Meeting, type Proposal } from "@/lib/api";

type StepKey = "meeting" | "analysis" | "proposal";
type StepState = "done" | "active" | "upcoming" | "failed";

function StageGlyph({ kind }: { kind: StepKey }) {
  if (kind === "meeting") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>;
  if (kind === "analysis") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>;
}

function CheckGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>;
}

const STEP_LABEL: Record<StepKey, string> = { meeting: "Reunião", analysis: "Análise", proposal: "Proposta" };

function StepCircle({ state, kind }: { state: StepState; kind: StepKey }) {
  const cls = `pipeline-circle pipeline-circle-${state}`;
  return <span className={cls}>{state === "done" ? <CheckGlyph /> : <StageGlyph kind={kind} />}</span>;
}

function stepBadge(state: StepState, labels: Partial<Record<StepState, string>>): { label: string; tone: string } {
  const toneMap: Record<StepState, string> = { done: "green", active: "blue", upcoming: "neutral", failed: "red" };
  return { label: labels[state] ?? state, tone: toneMap[state] };
}

function ProjectPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const project = await api.getProject(id);
    const [meeting, proposal] = await Promise.all([
      project.latest_meeting_id ? api.getMeeting(project.latest_meeting_id) : Promise.resolve(null as Meeting | null),
      project.latest_proposal_id ? api.getProposal(project.latest_proposal_id) : Promise.resolve(null as Proposal | null),
    ]);
    let analysis: Analysis | null = null;
    if (meeting && (meeting.status === "analysis_ready" || meeting.status === "reviewed")) analysis = await api.getAnalysis(meeting.id).catch(() => null);
    return { project, meeting, proposal, analysis };
  }, [id]);

  if (loading) return <AppShell title="Projeto" eyebrow="PROJETOS / DETALHES"><Loading text="Carregando o projeto…" /></AppShell>;
  if (error || !data) return <AppShell title="Projeto" eyebrow="PROJETOS / DETALHES" action={<Button href="/" variant="secondary">← Projetos</Button>}><ErrorBanner message={error ?? "Projeto indisponível."} onRetry={reload} /></AppShell>;

  const { project, meeting, proposal, analysis } = data;
  const st = STATUS_LABEL[project.status];
  const nextMeeting = `/projects/${project.id}/meetings/new`;

  async function openProposal() {
    if (opening) return;
    if (proposal) { router.push(`/proposals/${proposal.id}`); return; }
    if (!meeting) return;
    setOpening(true);
    setOpenError(null);
    try {
      router.push(`/proposals/${await ensureProposal(project.id, meeting.id)}`);
    } catch (e) {
      setOpenError(errorMessage(e));
      setOpening(false);
    }
  }
  const analysisHref = meeting ? `/meetings/${meeting.id}/analysis` : nextMeeting;

  // ── Deriva o estado de cada etapa do pipeline ──
  const meetingFailed = meeting?.status === "failed";
  const meetingDone = !!meeting && (meeting.status === "analysis_ready" || meeting.status === "reviewed");
  const analysisDone = !!analysis?.review_completed;
  const proposalDone = !!proposal?.approved_version;

  const meetingState: StepState = meetingFailed ? "failed" : meetingDone ? "done" : "active";
  const analysisState: StepState = analysisDone ? "done" : meetingDone ? "active" : "upcoming";
  const proposalState: StepState = proposalDone ? "done" : analysis ? "active" : "upcoming";

  // Qual card aparece expandido: a primeira etapa que ainda precisa de atenção.
  const activeKey: StepKey = !meetingDone ? "meeting" : !analysisDone ? "analysis" : !proposalDone ? "proposal" : "proposal";

  const meetingBadge = stepBadge(meetingState, { failed: "Falhou", done: "Concluída", active: meeting ? "Processando" : "Pendente" });
  const analysisBadge = stepBadge(analysisState, { done: "Revisada", active: "Pronta", upcoming: "Aguardando" });
  const proposalBadge = stepBadge(proposalState, { done: "Aprovada", active: "Disponível", upcoming: "Bloqueada" });

  // Pontos-chave reais extraídos da análise para a versão expandida do card.
  const keyPoints: string[] = analysis ? [
    ...analysis.requirements.slice(0, 2).map((r) => r.title),
    ...analysis.decisions.slice(0, 1).map((d) => d.description),
    ...analysis.commitments.slice(0, 1).map((c) => c.description),
  ].filter(Boolean).slice(0, 4) : [];

  return <AppShell title={project.name} eyebrow="PROJETOS / DETALHES" action={<Button href={nextMeeting} variant="secondary">+ Adicionar reunião</Button>}>
    <div className="pipeline-meta">
      <span className="pipeline-meta-client">{project.client.company}</span>
      <span className="pipeline-meta-sep">·</span>
      <span className="pipeline-meta-updated">Atualizado {timeAgo(project.updated_at)}</span>
      <Badge tone={st.tone}>{st.label}</Badge>
    </div>

    <div className="pipeline-stepper">
      {(["meeting", "analysis", "proposal"] as StepKey[]).map((key, i) => {
        const state = key === "meeting" ? meetingState : key === "analysis" ? analysisState : proposalState;
        const badge = key === "meeting" ? meetingBadge : key === "analysis" ? analysisBadge : proposalBadge;
        return <Fragment key={key}>
          <div className="pipeline-node">
            <StepCircle state={state} kind={key} />
            <strong>{STEP_LABEL[key]}</strong>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          {i < 2 && <div className={`pipeline-connector pipeline-connector-${state === "upcoming" ? "upcoming" : "filled"}`} />}
        </Fragment>;
      })}
    </div>

    <div className="pipeline-row">
      <section className={`pipeline-card pipeline-card-meeting ${activeKey === "meeting" ? "is-active" : "is-collapsed"}`}>
        <div className="pipeline-card-head">
          <span className={`pipeline-card-icon pipeline-card-icon-${meetingState}`}><StageGlyph kind="meeting" /></span>
          <h2>Reunião</h2>
          <Badge tone={meetingBadge.tone}>{meetingBadge.label}</Badge>
        </div>
        <div className="pipeline-card-body">
          <p className="pipeline-card-title">{meeting ? (meeting.title ?? "Reunião sem título") : "Nenhuma reunião ainda"}</p>
          {meeting && <small className="pipeline-card-sub">{meeting.source_type === "audio" ? "Áudio" : "Texto"} · {timeAgo(meeting.created_at)}</small>}
          {meetingFailed && <ErrorBanner message={meeting?.error?.message ?? "Falha no processamento."} />}
        </div>
        <div className="pipeline-card-foot">
          <Button href={nextMeeting} variant={activeKey === "meeting" ? "primary" : "secondary"}>{meeting ? "Adicionar outra reunião →" : "Adicionar reunião →"}</Button>
        </div>
      </section>

      <section className={`pipeline-card pipeline-card-analysis ${activeKey === "analysis" ? "is-active" : "is-collapsed"}`}>
        <div className="pipeline-card-head">
          <span className={`pipeline-card-icon pipeline-card-icon-${analysisState}`}><StageGlyph kind="analysis" /></span>
          <h2>Análise</h2>
          <Badge tone={analysisBadge.tone}>{analysisBadge.label}</Badge>
        </div>
        <div className="pipeline-card-body">
          {analysis ? <>
            <p className="pipeline-card-title">{analysis.review_completed ? "Revisão concluída" : "Revisão humana necessária"}</p>
            <div className="pipeline-metrics">
              <div className="pipeline-metric"><b>{analysis.requirements.length}</b><small>requisitos</small></div>
              <div className="pipeline-metric"><b>{analysis.decisions.length}</b><small>decisões</small></div>
              <div className="pipeline-metric"><b>{analysis.commitments.length}</b><small>compromissos</small></div>
            </div>
            {activeKey === "analysis" && keyPoints.length > 0 && (
              <div className="pipeline-insights">
                <small className="pipeline-insights-title">Pontos-chave identificados</small>
                {keyPoints.map((p, i) => <div className="pipeline-insight" key={i}><span>•</span><p>{p}</p></div>)}
              </div>
            )}
          </> : <p className="pipeline-card-title pipeline-card-muted">Disponível quando a reunião for processada</p>}
        </div>
        {analysis && <div className="pipeline-card-foot"><Button href={analysisHref} variant={activeKey === "analysis" ? "primary" : "secondary"}>{analysis.review_completed ? "Ver análise →" : "Revisar análise →"}</Button></div>}
      </section>

      <section className={`pipeline-card pipeline-card-proposal ${activeKey === "proposal" ? "is-active" : "is-collapsed"}`}>
        <div className="pipeline-card-head">
          <span className={`pipeline-card-icon pipeline-card-icon-${proposalState}`}><StageGlyph kind="proposal" /></span>
          <h2>Proposta</h2>
          <Badge tone={proposalBadge.tone}>{proposalBadge.label}</Badge>
        </div>
        <div className="pipeline-card-body">
          {proposal ? <p className="pipeline-card-title">Versão atual v{proposal.current_version}{proposal.approved_version ? ` · aprovada v${proposal.approved_version}` : ""}</p>
            : analysis ? <p className="pipeline-card-title">{analysis.review_completed ? "Gere a proposta a partir da análise revisada" : "Rascunho antes da revisão humana"}</p>
            : <p className="pipeline-card-title pipeline-card-muted">Disponível quando a análise estiver pronta</p>}
          {!proposal && !analysis && <div className="pipeline-skeleton"><span /><span /><span /></div>}
        </div>
        {proposal
          ? <div className="pipeline-card-foot"><Button href={`/proposals/${proposal.id}`} variant={activeKey === "proposal" ? "primary" : "secondary"}>Abrir proposta →</Button></div>
          : analysis
            ? <div className="pipeline-card-foot"><Button onClick={() => void openProposal()} variant={activeKey === "proposal" ? "primary" : "secondary"}>{opening ? "Gerando…" : "Visualizar proposta →"}</Button>{openError && <ErrorBanner message={openError} />}</div>
            : null}
      </section>
    </div>

    <ProjectDetailsForm key={project.updated_at} project={project} onSaved={reload} />
  </AppShell>;
}

export default function ProjectPage() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><ProjectPageInner /></Suspense>;
}
