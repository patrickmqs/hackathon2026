"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { ErrorBanner, Loading, errorMessage, useLoad } from "@/components/Api";
import { ProjectDetailsForm, isProjectIncomplete } from "@/components/ProjectDetailsForm";
import { ensureProposal } from "@/lib/proposal-job";
import { STATUS_LABEL, api, timeAgo, type Analysis, type Meeting, type Proposal } from "@/lib/api";

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
    {isProjectIncomplete(project) && <ProjectDetailsForm key={project.updated_at} project={project} onSaved={reload} />}
    <div className="stepper">{["Reunião", "Análise", "Proposta", "Aprovação", "Envio"].map((label, i) => <div className={i < st.step ? "done" : i === st.step ? "current" : ""} key={label}><b>{i < st.step ? "✓" : i + 1}</b><span>{label}</span></div>)}</div>
    <div className="stage-grid">
      <Card><Badge tone={meeting ? (meeting.status === "failed" ? "red" : "green") : "neutral"}>{!meeting ? "Pendente" : meeting.status === "failed" ? "Falhou" : meeting.status === "analysis_ready" || meeting.status === "reviewed" ? "Concluída" : "Processando"}</Badge><h2>Reunião</h2>
        <p>{meeting ? (meeting.title ?? "Reunião sem título") : "Nenhuma reunião ainda"}</p>{meeting && <small>{meeting.source_type === "audio" ? "Áudio" : "Texto"} · {timeAgo(meeting.created_at)}</small>}
        {meeting?.status === "failed" && <ErrorBanner message={meeting.error?.message ?? "Falha no processamento."} />}
        <Link href={nextMeeting}>{meeting ? "Adicionar outra reunião →" : "Adicionar reunião →"}</Link></Card>
      <Card><Badge tone={analysis ? "blue" : "neutral"}>{analysis ? (analysis.review_completed ? "Revisada" : "Pronta") : "Aguardando"}</Badge><h2>Análise</h2>
        {analysis ? <><p>{analysis.review_completed ? "Revisão concluída" : "Revisão humana necessária"}</p><div className="counts"><b>{analysis.requirements.length}<small>requisitos</small></b><b>{analysis.decisions.length}<small>decisões</small></b><b>{analysis.commitments.length}<small>compromissos</small></b></div><Button href={analysisHref}>{analysis.review_completed ? "Ver análise →" : "Revisar análise →"}</Button></> : <p>Disponível quando a reunião for processada</p>}</Card>
      <Card><Badge tone={proposal ? (proposal.approved_version ? "green" : "blue") : analysis ? "blue" : "neutral"}>{proposal ? (proposal.approved_version ? "Aprovada" : "Rascunho") : analysis ? "Disponível" : "Bloqueada"}</Badge><h2>Proposta</h2>
        {proposal ? <><p>Versão atual v{proposal.current_version}{proposal.approved_version ? ` · aprovada v${proposal.approved_version}` : ""}</p><Button href={`/proposals/${proposal.id}`}>Abrir proposta →</Button></> : analysis ? <><p>{analysis.review_completed ? "Gere a proposta a partir da análise revisada" : "Rascunho antes da revisão humana"}</p><Button onClick={() => void openProposal()}>{opening ? "Gerando…" : "Visualizar proposta →"}</Button>{openError && <ErrorBanner message={openError} />}</> : <><p>Disponível quando a análise estiver pronta</p><small>⌁ Aguardando a análise da reunião</small></>}</Card>
    </div>
  </AppShell>;
}

export default function ProjectPage() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><ProjectPageInner /></Suspense>;
}
