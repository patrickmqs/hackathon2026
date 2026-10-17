"use client";

import { useState } from "react";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";

const items = [
  { title: "Portal para pedidos B2B", type: "Necessidade", quote: "Hoje nossos pedidos chegam por WhatsApp e planilha.", tone: "blue" },
  { title: "Catálogo com preços por cliente", type: "Requisito", quote: "Cada distribuidor precisa ver uma tabela diferente.", tone: "purple" },
  { title: "Integração com ERP existente", type: "Requisito", quote: "A ideia é não substituir o ERP, só conectar.", tone: "purple" },
  { title: "Autenticação por perfil de usuário", type: "Requisito", quote: "O comprador só pode acessar os pedidos e preços da própria empresa.", tone: "purple" },
  { title: "Acompanhamento do status do pedido", type: "Requisito", quote: "Precisamos saber se o pedido foi recebido, separado ou faturado.", tone: "purple" },
  { title: "Sincronização de estoque e disponibilidade", type: "Requisito", quote: "O catálogo precisa mostrar apenas o que está disponível no estoque.", tone: "purple" },
  { title: "Histórico e segunda via de pedidos", type: "Requisito", quote: "Também queremos consultar pedidos antigos e baixar uma segunda via.", tone: "purple" },
  { title: "Lançamento no segundo semestre", type: "Compromisso", quote: "Se começarmos em maio, conseguimos lançar no segundo semestre.", tone: "amber" },
];

export default function AnalysisPage() {
  const [selected, setSelected] = useState(0);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");
  const item = items[selected];
  const visibleItems = items.filter((entry) => entry.title.toLowerCase().includes(query.toLowerCase()) || entry.type.toLowerCase().includes(query.toLowerCase()));

  return <AppShell title="Revisão da análise" eyebrow="PORTAL DE PEDIDOS B2B / ANÁLISE" action={<Button href="/projects/demo" variant="secondary">← Voltar ao projeto</Button>}>
    <div className="review-head"><div><Badge tone="blue">Análise pronta</Badge><h2>Revise o que a IA encontrou na reunião.</h2><p>Confirme cada evidência antes de transformar a conversa em proposta.</p></div><div className="review-progress"><b>6 de 16 <span>38%</span></b><small>itens revisados</small><i><em /></i></div></div>
    <div className="analysis-overview">
      <button className="analysis-summary active"><b className="summary-icon blue">✦</b><span><strong>Necessidades encontradas</strong><small>1 item identificado</small></span><em>01</em></button>
      <button className="analysis-summary" onClick={() => setSelected(1)}><b className="summary-icon purple">◇</b><span><strong>Requisitos</strong><small>6 itens para revisar</small></span><em>06</em></button>
      <button className="analysis-summary" onClick={() => setSelected(7)}><b className="summary-icon amber">◷</b><span><strong>Compromissos</strong><small>1 item pendente</small></span><em>01</em></button>
      <div className="analysis-summary confidence"><b className="summary-icon green">✓</b><span><strong>Confiança da IA</strong><small>Alta nas citações encontradas</small></span><em>Alta</em></div>
    </div>
    <div className="review-layout"><Card className="items-panel"><div className="card-heading"><div><strong>Itens encontrados</strong><small>8 evidências extraídas da reunião</small></div><Badge tone="blue">6/20 revisados</Badge></div><div className="analysis-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar item ou categoria..." /></div><div className="item-filter"><button className="active">Todos <b>08</b></button><button>Não revisados <b>07</b></button><button>Confirmados <b>01</b></button></div>{visibleItems.map((entry) => { const index = items.indexOf(entry); return <button className={`review-item ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)} key={entry.title}><b className={`item-icon ${entry.tone}`}>{entry.type === "Requisito" ? "◇" : entry.type === "Compromisso" ? "◷" : "✦"}</b><span><small>{entry.type}</small><strong>{entry.title}</strong><em>⌁ Citação encontrada</em></span><b className="item-state">{index === 0 ? "✓" : "○"}</b></button>; })}<div className="actions review-actions"><small>30% revisado</small><Button onClick={() => setSaved(true)}>Concluir revisão →</Button></div>{saved && <p className="success">Revisão salva. A proposta pode ser gerada.</p>}</Card>
      <Card className="detail"><div className="detail-top"><Badge tone={item.tone}>{item.type}</Badge><Badge tone="green">Confiança alta</Badge><span className="detail-id">ID-00{selected + 1}</span></div><h2>{item.title}</h2><span className="ai">✦ Sugestão estruturada pela IA</span><label>O que foi identificado<p>{item.quote}</p></label><div className="detail-meta"><span>Origem <b>Reunião de descoberta</b></span><span>Revisão <b>Pendente</b></span></div><div className="detail-actions"><Button variant="secondary">✓ Confirmar item</Button><Button variant="secondary">✎ Editar item</Button><Button variant="danger">× Rejeitar</Button></div><a href="#transcript">Ver na transcrição ↗</a></Card>
      <Card className="transcript-panel" id="transcript"><div className="card-heading"><div><h2>Transcrição</h2><p>Encontre a origem de cada evidência</p></div><Badge>42:18</Badge></div><div className="transcript-search">⌕ <input placeholder="Buscar na transcrição..." /></div><div className="transcript-speaker"><span>AS</span><div><strong>Ana Souza <small>08:42</small></strong><p>Hoje nossos pedidos chegam por WhatsApp e planilha. Cada distribuidor precisa ver uma tabela de preços diferente.</p></div></div><div className="transcript-speaker muted-line"><span>MR</span><div><strong>Marina Rocha <small>08:55</small></strong><p>A ideia é conectar ao ERP existente sem substituir o que vocês já usam.</p></div></div><div className="transcript-highlight">Citação selecionada<br /><b>“{item.quote}”</b></div></Card>
    </div>
  </AppShell>;
}
