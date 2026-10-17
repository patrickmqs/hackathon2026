"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { projects } from "@/lib/mocks";

export default function Home() {
  const [period, setPeriod] = useState("30 dias");
  const [status, setStatus] = useState("Todos os status");
  const [reportOpen, setReportOpen] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const filteredProjects = useMemo(() => status === "Todos os status" ? projects : projects.filter((project) => project.status === status), [status]);
  const reportUrl = typeof window === "undefined" ? "" : `${window.location.origin}/reports/dashboard?period=${encodeURIComponent(period)}&status=${encodeURIComponent(status)}`;

  useEffect(() => {
    if (!reportOpen || !reportUrl) return;
    QRCode.toDataURL(reportUrl, { width: 220, margin: 2, color: { dark: "#1d2938", light: "#ffffff" } })
      .then(setQrCode)
      .catch(() => setQrCode(""));
  }, [reportOpen, reportUrl]);

  return <AppShell title="Projetos" eyebrow="VISÃO GERAL" action={<div className="header-actions"><Button variant="secondary" onClick={() => setReportOpen(true)}>▣ Gerar relatório</Button><Button href="/projects/new">+ Novo projeto</Button></div>}>
    <div className="welcome"><div><h2>Bom dia, Marina <span>✦</span></h2><p>Acompanhe suas propostas e transforme conversas em próximos passos.</p></div><div className="metrics"><b>03<small>projetos ativos</small></b><b>01<small>aguardando revisão</small></b></div></div>
    <Card className="dashboard-controls"><div><strong>Visão do período</strong><small>Explore os dados do seu workspace</small></div><div className="control-group"><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>7 dias</option><option>30 dias</option><option>90 dias</option></select><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos os status</option><option>Análise pronta</option><option>Proposta aprovada</option><option>Sem reunião</option></select></div></Card>
    <div className="chart-grid"><Card><div className="card-heading"><div><h2>Projetos por status</h2><p>Distribuição no período selecionado</p></div><span className="chart-total">03</span></div><div className="status-chart"><div className="donut" /><div className="chart-legend"><span><i className="legend blue" />Análise pronta <b>01</b></span><span><i className="legend green" />Proposta aprovada <b>01</b></span><span><i className="legend amber" />Sem reunião <b>01</b></span></div></div></Card><Card className="conversion-card"><div className="card-heading"><div><h2>Conversão do fluxo</h2><p>Da reunião ao envio</p></div><span className="conversion-rate">33%</span></div><div className="conversion-flow"><span><b>06</b><small>Reuniões</small></span><i>→</i><span><b>04</b><small>Análises</small></span><i>→</i><span><b>02</b><small>Propostas</small></span><i>→</i><span><b>02</b><small>Enviadas</small></span></div><div className="conversion-track"><i style={{ width: "33%" }} /></div></Card></div>
    <div className="grid-2"><Card className="wide"><div className="card-heading"><div><h2>Seus projetos</h2><p>{filteredProjects.length} projetos encontrados</p></div><Link href="/projects/demo">Ver todos →</Link></div><div className="project-list">{filteredProjects.map((project, index) => <Link href={index === 0 ? "/projects/demo" : "#"} className="project-row" key={project.name}><b className={`project-icon p${index}`}>⌁</b><span className="project-name"><strong>{project.name}</strong><small>{project.client}</small></span><i className="progress"><em style={{ width: `${project.progress}%` }} /></i><Badge tone={project.tone}>{project.status}</Badge><small className="updated">há {index ? "1 dia" : "12 min"}</small>›</Link>)}</div></Card>
      <Card><div className="card-heading"><div><h2>Saúde dos canais</h2><p>Prontos para enviar</p></div><b className="green-text">●</b></div><div className="health-list"><p><b className="channel gmail">M</b><span><strong>Gmail</strong><small>Conectado como marina@acme.io</small></span><b className="green-text">✓</b></p><p><b className="channel whatsapp">◔</b><span><strong>WhatsApp</strong><small>Não configurado</small></span><b>—</b></p></div><Link href="/settings">Gerenciar canais →</Link></Card>
    </div>
    <Card className="activity"><div className="card-heading"><div><h2>Atividade recente</h2><p>Eventos dos seus projetos</p></div><Link href="/projects/demo">Ver timeline →</Link></div><p className="activity-row"><i className="dot green" /><span><strong>Proposta aprovada</strong><small>App de fidelidade · Rafael Mendes</small></span><time>Ontem, 16:42</time></p><p className="activity-row"><i className="dot blue" /><span><strong>Análise pronta para revisão</strong><small>Portal de Pedidos B2B · Proposal AI</small></span><time>Hoje, 10:18</time></p></Card>
    {reportOpen && <div className="modal-backdrop" role="presentation" onClick={() => setReportOpen(false)}><div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setReportOpen(false)} aria-label="Fechar">×</button><span className="report-icon">▣</span><h2 id="report-title">Relatório do dashboard</h2><p>Escaneie para abrir um resumo dos gráficos e indicadores exibidos agora.</p>{qrCode ? <img className="qr-code" src={qrCode} alt="QR Code para abrir o relatório do dashboard" /> : <div className="qr-loading">Gerando QR Code...</div>}<strong>{period} · {status}</strong><small>O relatório é somente leitura e reflete os filtros selecionados.</small><div className="modal-actions"><Button variant="secondary" onClick={() => navigator.clipboard?.writeText(reportUrl)}>Copiar link</Button><a className="button primary" href={reportUrl} target="_blank" rel="noreferrer">Abrir relatório</a></div></div></div>}
  </AppShell>;
}
