"use client";

import { useSearchParams } from "next/navigation";
import { AppShell, Badge, Card } from "@/components/AppShell";

export default function ReportView() {
  const params = useSearchParams();
  const period = params.get("period") || "30 dias";
  const status = params.get("status") || "Todos os status";

  return <AppShell title="Relatório do dashboard" eyebrow="RELATÓRIO / SOMENTE LEITURA"><div className="report-heading"><div><Badge tone="blue">Relatório gerado</Badge><h2>Visão geral dos projetos</h2><p>Indicadores compartilhados a partir do dashboard Proposal AI.</p></div><small>Filtro: {period} · {status}</small></div><div className="report-metrics"><Card><small>Projetos ativos</small><strong>03</strong><span>no período selecionado</span></Card><Card><small>Propostas aprovadas</small><strong>01</strong><span>33% de conversão</span></Card><Card><small>Itens em revisão</small><strong>10</strong><span>necessitam de atenção</span></Card></div><div className="report-grid"><Card><h2>Projetos por status</h2><p>Distribuição atual do workspace</p><div className="report-donut" /><div className="report-legend"><span><i className="legend blue" />Análise pronta <b>01</b></span><span><i className="legend green" />Proposta aprovada <b>01</b></span><span><i className="legend amber" />Sem reunião <b>01</b></span></div></Card><Card><h2>Conversão do fluxo</h2><p>Da reunião ao envio</p><div className="report-flow"><b>06<small>Reuniões</small></b><span>→</span><b>04<small>Análises</small></b><span>→</span><b>02<small>Propostas</small></b><span>→</span><b>02<small>Envios</small></b></div><div className="conversion-track"><i style={{ width: "33%" }} /></div></Card></div><footer>Gerado pelo Proposal AI · Visualização somente leitura</footer></AppShell>;
}
