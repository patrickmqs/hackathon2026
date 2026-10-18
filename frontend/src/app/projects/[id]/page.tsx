"use client";
import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { ErrorBanner, Loading, errorMessage, useLoad } from "@/components/Api";
import { ProjectDetailsForm } from "@/components/ProjectDetailsForm";
import { ensureProposal } from "@/lib/proposal-job";
import { STATUS_LABEL, api, timeAgo, type Analysis, type Meeting, type Proposal } from "@/lib/api";

function StageGlyph({ kind }: { kind: "meeting" | "analysis" | "proposal" }) {
  if (kind === "meeting") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>;
  if (kind === "analysis") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>;
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
  // Visualiza a proposta mesmo sem revisão concluída: cria o rascunho se ainda não existir.
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

  return <AppShell title={project.name} eyebrow="PROJETOS / DETALHES" action={<Button href={nextMeeting} variant="secondary">+ Adicionar reunião</Button>}>
    <div className="project-meta">{project.client.company} <span>•</span> Atualizado {timeAgo(project.updated_at)} <Badge tone={st.tone}>{st.label}</Badge></div>
    <div className="stage-grid">
      <Card className="stage-card stage-meeting">
        <span className="stage-watermark blue" aria-hidden="true"><StageGlyph kind="meeting" /></span>
        <div className="stage-head"><span className="stage-icon blue"><StageGlyph kind="meeting" /></span><h2>Reunião</h2><Badge tone={meeting ? (meeting.status === "failed" ? "red" : "green") : "neutral"}>{!meeting ? "Pendente" : meeting.status === "failed" ? "Falhou" : meeting.status === "analysis_ready" || meeting.status === "reviewed" ? "Concluída" : "Processando"}</Badge></div>
        <div className="stage-body">
          <p>{meeting ? (meeting.title ?? "Reunião sem título") : "Nenhuma reunião ainda"}</p>
          {meeting && <small>{meeting.source_type === "audio" ? "Áudio" : "Texto"} · {timeAgo(meeting.created_at)}</small>}
          {meeting?.status === "failed" && <ErrorBanner message={meeting.error?.message ?? "Falha no processamento."} />}
        </div>
        <div className="stage-foot"><Button href={nextMeeting} variant="secondary">{meeting ? "Adicionar outra reunião →" : "Adicionar reunião →"}</Button></div>
      </Card>
      <Card className="stage-card stage-analysis">
        <span className="stage-watermark purple" aria-hidden="true"><StageGlyph kind="analysis" /></span>
        <div className="stage-head"><span className="stage-icon purple"><StageGlyph kind="analysis" /></span><h2>Análise</h2><Badge tone={analysis ? "blue" : "neutral"}>{analysis ? (analysis.review_completed ? "Revisada" : "Pronta") : "Aguardando"}</Badge></div>
        <div className="stage-body">
          {analysis ? <><p>{analysis.review_completed ? "Revisão concluída" : "Revisão humana necessária"}</p><div className="counts"><b>{analysis.requirements.length}<small>requisitos</small></b><b>{analysis.decisions.length}<small>decisões</small></b><b>{analysis.commitments.length}<small>compromissos</small></b></div></> : <p>Disponível quando a reunião for processada</p>}
        </div>
        {analysis && <div className="stage-foot"><Button href={analysisHref}>{analysis.review_completed ? "Ver análise →" : "Revisar análise →"}</Button></div>}
      </Card>
      <Card className="stage-card stage-proposal">
        <span className="stage-watermark green" aria-hidden="true"><StageGlyph kind="proposal" /></span>
        <div className="stage-head"><span className="stage-icon green"><StageGlyph kind="proposal" /></span><h2>Proposta</h2><Badge tone={proposal ? (proposal.approved_version ? "green" : "blue") : analysis ? "blue" : "neutral"}>{proposal ? (proposal.approved_version ? "Aprovada" : "Rascunho") : analysis ? "Disponível" : "Bloqueada"}</Badge></div>
        <div className="stage-body">
          {proposal ? <p>Versão atual v{proposal.current_version}{proposal.approved_version ? ` · aprovada v${proposal.approved_version}` : ""}</p> : analysis ? <p>{analysis.review_completed ? "Gere a proposta a partir da análise revisada" : "Rascunho antes da revisão humana"}</p> : <><p>Disponível quando a análise estiver pronta</p><small>⌁ Aguardando a análise da reunião</small></>}
        </div>
        {proposal ? <div className="stage-foot"><Button href={`/proposals/${proposal.id}`}>Abrir proposta →</Button></div> : analysis ? <div className="stage-foot"><Button onClick={() => void openProposal()}>{opening ? "Gerando…" : "Visualizar proposta →"}</Button>{openError && <ErrorBanner message={openError} />}</div> : null}
      </Card>
    </div>
    <ProjectDetailsForm key={project.updated_at} project={project} onSaved={reload} />
  </AppShell>;
}

export default function ProjectPage() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><ProjectPageInner /></Suspense>;
}
