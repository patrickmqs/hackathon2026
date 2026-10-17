"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { ErrorBanner, Loading, useLoad } from "@/components/Api";
import { STATUS_LABEL, api, timeAgo, type Analysis, type Meeting, type Proposal } from "@/lib/api";

const EVENT_LABEL: Record<string, [string, string]> = {
  "project.created": ["Projeto criado", "gray"],
  "meeting.created": ["Reunião adicionada", "gray"],
  "meeting.transcribed": ["Transcrição concluída", "purple"],
  "analysis.ready": ["Análise pronta para revisão", "blue"],
  "analysis.reviewed": ["Revisão da análise concluída", "green"],
  "proposal.version_created": ["Versão da proposta criada", "blue"],
  "proposal.approved": ["Proposta aprovada", "green"],
};

function ProjectPageInner() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useLoad(async () => {
    const project = await api.getProject(id);
    const [meeting, proposal, events] = await Promise.all([
      project.latest_meeting_id ? api.getMeeting(project.latest_meeting_id) : Promise.resolve(null as Meeting | null),
      project.latest_proposal_id ? api.getProposal(project.latest_proposal_id) : Promise.resolve(null as Proposal | null),
      api.projectEvents(id).catch(() => ({ items: [], total: 0 })),
    ]);
    let analysis: Analysis | null = null;
    if (meeting && (meeting.status === "analysis_ready" || meeting.status === "reviewed")) analysis = await api.getAnalysis(meeting.id).catch(() => null);
    return { project, meeting, proposal, events: events.items, analysis };
  }, [id]);

  if (loading) return <AppShell title="Projeto" eyebrow="PROJETOS / DETALHES"><Loading text="Carregando o projeto…" /></AppShell>;
  if (error || !data) return <AppShell title="Projeto" eyebrow="PROJETOS / DETALHES" action={<Button href="/" variant="secondary">← Projetos</Button>}><ErrorBanner message={error ?? "Projeto indisponível."} onRetry={reload} /></AppShell>;

  const { project, meeting, proposal, events, analysis } = data;
  const st = STATUS_LABEL[project.status];
  const nextMeeting = `/projects/${project.id}/meetings/new`;
  const analysisHref = meeting ? `/meetings/${meeting.id}/analysis` : nextMeeting;

  return <AppShell title={project.name} eyebrow="PROJETOS / DETALHES" action={<Button href={nextMeeting} variant="secondary">+ Adicionar reunião</Button>}>
    <div className="project-meta">{project.client.company} <span>•</span> Atualizado {timeAgo(project.updated_at)} <Badge tone={st.tone}>{st.label}</Badge></div>
    <div className="stepper">{["Reunião", "Análise", "Proposta", "Aprovação", "Envio"].map((label, i) => <div className={i < st.step ? "done" : i === st.step ? "current" : ""} key={label}><b>{i < st.step ? "✓" : i + 1}</b><span>{label}</span></div>)}</div>
    <div className="stage-grid">
      <Card><Badge tone={meeting ? (meeting.status === "failed" ? "red" : "green") : "neutral"}>{!meeting ? "Pendente" : meeting.status === "failed" ? "Falhou" : meeting.status === "analysis_ready" || meeting.status === "reviewed" ? "Concluída" : "Processando"}</Badge><h2>Reunião</h2>
        <p>{meeting ? (meeting.title ?? "Reunião sem título") : "Nenhuma reunião ainda"}</p>{meeting && <small>{meeting.source_type === "audio" ? "Áudio" : "Texto"} · {timeAgo(meeting.created_at)}</small>}
        {meeting?.status === "failed" && <ErrorBanner message={meeting.error?.message ?? "Falha no processamento."} />}
        <Link href={nextMeeting}>{meeting ? "Adicionar outra reunião →" : "Adicionar reunião →"}</Link></Card>
      <Card><Badge tone={analysis ? "blue" : "neutral"}>{analysis ? (analysis.review_completed ? "Revisada" : "Pronta") : "Aguardando"}</Badge><h2>Análise</h2>
        {analysis ? <><p>{analysis.review_completed ? "Revisão concluída" : "Revisão humana necessária"}</p><div className="counts"><b>{analysis.requirements.length}<small>requisitos</small></b><b>{analysis.decisions.length}<small>decisões</small></b><b>{analysis.commitments.length}<small>compromissos</small></b></div><Button href={analysisHref}>{analysis.review_completed ? "Ver análise →" : "Revisar análise →"}</Button></> : <p>Disponível quando a reunião for processada</p>}</Card>
      <Card><Badge tone={proposal ? (proposal.approved_version ? "green" : "amber") : "neutral"}>{proposal ? (proposal.approved_version ? "Aprovada" : "Rascunho") : "Bloqueada"}</Badge><h2>Proposta</h2>
        {proposal ? <><p>Versão atual v{proposal.current_version}{proposal.approved_version ? ` · aprovada v${proposal.approved_version}` : ""}</p><Button href={`/proposals/${proposal.id}`}>Abrir proposta →</Button></> : <><p>Conclua a revisão para gerar</p><small>⌁ Aguardando revisão da análise</small></>}</Card>
    </div>
    <div className="grid-2 timeline-layout"><Card><div className="card-heading"><div><h2>Timeline do projeto</h2><p>Histórico de eventos</p></div></div>
      <div className="timeline">{events.length ? events.map((e) => { const [label, tone] = EVENT_LABEL[e.type] ?? [e.type, "gray"]; return <div key={e.id}><i className={`dot ${tone}`} /><span><small>{timeAgo(e.at)}{e.actor ? ` · ${e.actor}` : ""}</small><strong>{label}</strong></span></div>; }) : <p className="hint">Nenhum evento ainda.</p>}</div></Card>
      <Card className="next"><small>PRÓXIMO PASSO</small>{!meeting ? <><h2>Adicione a primeira reunião</h2><p>Cole a transcrição ou envie o áudio.</p><Button href={nextMeeting}>Adicionar reunião →</Button></> : analysis && !analysis.review_completed ? <><h2>Revise a análise da reunião</h2><p>Confirme o que foi dito antes de transformar a conversa em uma proposta.</p><Button href={analysisHref}>Começar revisão →</Button></> : proposal ? <><h2>Abra a proposta</h2><p>Edite, gere o PDF e aprove a versão.</p><Button href={`/proposals/${proposal.id}`}>Abrir proposta →</Button></> : <><h2>Aguarde o processamento</h2><p>A análise aparece aqui quando a reunião terminar.</p></>}</Card></div>
  </AppShell>;
}

export default function ProjectPage() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><ProjectPageInner /></Suspense>;
}
