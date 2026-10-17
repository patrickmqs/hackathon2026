"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, Badge, Card } from "@/components/AppShell";
import { MeetingIntake } from "@/components/MeetingIntake";
import { projects as mockProjects } from "@/lib/mocks";
import { STATUS_LABEL, api, timeAgo } from "@/lib/api";
import "@/components/integration.css";

export default function Home() {
  const [period, setPeriod] = useState("30 dias");
  const [status, setStatus] = useState("Todos os status");
  // Projetos reais da API; se o backend estiver fora do ar, cai nos dados de exemplo (mocks) com aviso.
  const [apiProjects, setApiProjects] = useState<{ id: string; name: string; client: string; status: string; tone: string; progress: number; updated: string }[] | null>(null);
  const [apiDown, setApiDown] = useState<string | null>(null);
  useEffect(() => {
    api.listProjects()
      .then((r) => { setApiProjects(r.items.map((p) => { const st = STATUS_LABEL[p.status]; return { id: p.id, name: p.name, client: p.client.company ?? "", status: st.label, tone: st.tone, progress: st.progress, updated: timeAgo(p.updated_at) }; })); })
      .catch((e: Error) => { setApiDown(e.message); setApiProjects(null); });
  }, []);
  const projects = apiProjects ?? mockProjects.map((m) => ({ id: "demo", updated: "", ...m }));
  const filteredProjects = status === "Todos os status" ? projects : projects.filter((project) => project.status === status);
  return <AppShell title="Relatórios" eyebrow="VISÃO GERAL">
    <div className="welcome"><div><h2>Bom dia, Marina <span>✦</span></h2><p>Acompanhe suas propostas e transforme conversas em próximos passos.</p></div><div className="metrics"><b>03<small>projetos ativos</small></b><b>01<small>aguardando revisão</small></b></div></div>
    <Card className="dashboard-controls"><div><strong>Visão do período</strong><small>Explore os dados do seu workspace</small></div><div className="control-group"><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>7 dias</option><option>30 dias</option><option>90 dias</option></select><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos os status</option><option>Análise pronta</option><option>Proposta aprovada</option><option>Sem reunião</option><option>Processando</option><option>Análise revisada</option><option>Proposta em rascunho</option><option>Enviada</option><option>Falhou</option></select></div></Card>
    <div className="chart-grid"><MeetingIntake /><Card><div className="card-heading"><div><h2>Projetos por status</h2><p>Distribuição no período selecionado</p></div><span className="chart-total">03</span></div><div className="status-chart"><div className="donut" /><div className="chart-legend"><span><i className="legend blue" />Análise pronta <b>01</b></span><span><i className="legend green" />Proposta aprovada <b>01</b></span><span><i className="legend amber" />Sem reunião <b>01</b></span></div></div></Card><Card className="conversion-card"><div className="card-heading"><div><h2>Conversão do fluxo</h2><p>Da reunião ao envio</p></div><span className="conversion-rate">33%</span></div><div className="conversion-flow"><span><b>06</b><small>Reuniões</small></span><i>→</i><span><b>04</b><small>Análises</small></span><i>→</i><span><b>02</b><small>Propostas</small></span><i>→</i><span><b>02</b><small>Enviadas</small></span></div><div className="conversion-track"><i style={{ width: "33%" }} /></div></Card></div>
    <div className="grid-2"><Card className="wide"><div className="card-heading"><div><h2>Seus projetos</h2><p>{filteredProjects.length} projetos encontrados</p></div><Link href="/projects/demo">Ver todos →</Link></div><div className="project-list">{apiDown && <p className="api-error" role="alert">⚠ {apiDown} Exibindo dados de exemplo.</p>}{apiProjects && !apiProjects.length && <p className="hint">Nenhum projeto ainda. <Link href="/projects/new">Crie o primeiro →</Link></p>}{filteredProjects.map((project, index) => <Link href={apiProjects ? `/projects/${project.id}` : (index === 0 ? "/projects/demo" : "#")} className="project-row" key={project.id + project.name}><b className={`project-icon p${index}`}>⌁</b><span className="project-name"><strong>{project.name}</strong><small>{project.client}</small></span><i className="progress"><em style={{ width: `${project.progress}%` }} /></i><Badge tone={project.tone}>{project.status}</Badge><small className="updated">{apiProjects ? project.updated : `há ${index ? "1 dia" : "12 min"}`}</small>›</Link>)}</div></Card>
      <Card><div className="card-heading"><div><h2>Saúde dos canais</h2><p>Prontos para enviar</p></div><b className="green-text">●</b></div><div className="health-list"><p><b className="channel gmail">M</b><span><strong>Gmail</strong><small>Conectado como marina@acme.io</small></span><b className="green-text">✓</b></p><p><b className="channel whatsapp">◔</b><span><strong>WhatsApp</strong><small>Não configurado</small></span><b>—</b></p></div><Link href="/settings">Gerenciar canais →</Link></Card>
    </div>
    <Card className="activity"><div className="card-heading"><div><h2>Atividade recente</h2><p>Eventos dos seus projetos</p></div><Link href="/projects/demo">Ver timeline →</Link></div><p className="activity-row"><i className="dot green" /><span><strong>Proposta aprovada</strong><small>App de fidelidade · Rafael Mendes</small></span><time>Ontem, 16:42</time></p><p className="activity-row"><i className="dot blue" /><span><strong>Análise pronta para revisão</strong><small>Portal de Pedidos B2B · Proposal AI</small></span><time>Hoje, 10:18</time></p></Card>
  </AppShell>;
}
