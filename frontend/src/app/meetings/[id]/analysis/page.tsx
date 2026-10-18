"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { ReviewChat } from "@/components/ReviewChat";
import { ErrorBanner, Loading, errorMessage, useLoad } from "@/components/Api";
import { ensureProposal, regenerateProposal } from "@/lib/proposal-job";
import { api, type Analysis, type ReviewStatus, type SourceRef, type Summary } from "@/lib/api";

type Kind = "client_needs" | "requirements" | "decisions" | "commitments" | "open_issues" | "tech_suggestions";
interface Row { key: string; id: string; kind: Kind; type: string; tone: string; icon: string; title: string; detail: string; refs: SourceRef[]; confidence: string; review: ReviewStatus; extra: string }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const CONF: Record<string, { label: string; tone: string }> = { high: { label: "Confiança alta", tone: "green" }, medium: { label: "Confiança média", tone: "amber" }, low: { label: "Confiança baixa", tone: "red" } };
const REVIEW: Record<ReviewStatus, string> = { pending: "Pendente", confirmed: "Confirmado", edited: "Editado", rejected: "Rejeitado", needs_clarification: "Precisa esclarecer" };
const KIND_LABEL: Record<Kind, string> = { client_needs: "Necessidades", requirements: "Requisitos", decisions: "Decisões", commitments: "Compromissos", open_issues: "Pendências", tech_suggestions: "Sugestões da IA" };

function rowsOf(a: Analysis): Row[] {
  const out: Row[] = [];
  for (const x of a.client_needs) out.push({ key: `client_needs:${x.id}`, id: x.id, kind: "client_needs", type: "Necessidade", tone: "blue", icon: "✦", title: x.description, detail: "", refs: x.source_refs, confidence: x.confidence, review: x.review_status, extra: x.category });
  for (const x of a.requirements) out.push({ key: `requirements:${x.id}`, id: x.id, kind: "requirements", type: "Requisito", tone: "purple", icon: "◇", title: x.title, detail: x.description, refs: x.source_refs, confidence: x.confidence, review: x.review_status, extra: x.type });
  for (const x of a.decisions) out.push({ key: `decisions:${x.id}`, id: x.id, kind: "decisions", type: x.status === "confirmed" ? "Decisão" : "Decisão pendente", tone: x.status === "confirmed" ? "green" : "amber", icon: "◈", title: x.description, detail: x.agreed_by.length ? `Acordado por: ${x.agreed_by.join(", ")}` : "Sem concordância registrada de ambos os lados.", refs: x.source_refs, confidence: x.confidence, review: x.review_status, extra: x.status });
  for (const x of a.commitments) out.push({ key: `commitments:${x.id}`, id: x.id, kind: "commitments", type: "Compromisso", tone: "amber", icon: "◷", title: `${x.owner}: ${x.description}`, detail: `Prazo dito: ${x.due_text ?? "não informado"} · Status: ${x.status}${x.owner === "não identificado" ? " · dono não identificado: confira na transcrição" : ""}`, refs: x.source_refs, confidence: x.confidence, review: x.review_status, extra: x.status });
  for (const x of a.open_issues) out.push({ key: `open_issues:${x.id}`, id: x.id, kind: "open_issues", type: x.type === "contradiction" ? "Contradição" : "Pendência", tone: x.type === "contradiction" ? "red" : "neutral", icon: "?", title: x.description, detail: x.suggested_question ? `Pergunta sugerida: ${x.suggested_question}` : "", refs: x.source_refs, confidence: x.confidence, review: x.review_status, extra: x.type });
  for (const x of a.tech_suggestions) out.push({ key: `tech_suggestions:${x.id}`, id: x.id, kind: "tech_suggestions", type: "Sugestão da IA", tone: "purple", icon: "✧", title: x.description, detail: `${x.rationale} · Estas sugestões não foram validadas com o cliente.`, refs: x.source_refs, confidence: x.confidence, review: x.review_status, extra: x.category });
  return out;
}

function AnalysisPageInner() {
  const { id: meetingId } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(async () => {
    const meeting = await api.getMeeting(meetingId);
    const [analysis, project] = await Promise.all([api.getAnalysis(meetingId), api.getProject(meeting.project_id)]);
    return { meeting, analysis, project };
  }, [meetingId]);

  const [override, setAnalysis] = useState<Analysis | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");
  const [kindFilter, setKindFilter] = useState<Kind | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [focusQuote, setFocusQuote] = useState<string | null>(null);
  const [acceptPending, setAcceptPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTabState] = useState<"items" | "transcript">("items");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const setTab = (t: "items" | "transcript") => { setTabState(t); setDrawerOpen(true); };

  const analysis: Analysis | null = override ?? data?.analysis ?? null;

  const rows = useMemo(() => (analysis ? rowsOf(analysis) : []), [analysis]);
  const sel = rows.find((r) => r.key === selected) ?? rows[0] ?? null;
  const quote = focusQuote ?? sel?.refs[0]?.quote ?? null;
  const reviewed = rows.filter((r) => r.review !== "pending").length;
  const pending = rows.length - reviewed;
  const pct = rows.length ? Math.round((reviewed / rows.length) * 100) : 0;
  const visible = rows.filter((r) => {
    if (kindFilter && r.kind !== kindFilter) return false;
    if (filter === "pending" && r.review !== "pending") return false;
    if (filter === "done" && r.review === "pending") return false;
    const q = query.toLowerCase();
    return !q || r.title.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
  });

  const lines = useMemo(() => {
    const t = data?.meeting.transcript?.text ?? "";
    const ls = t.split(/\r?\n/).filter((l) => l.trim());
    return ls.length > 2 ? ls : t.split(/(?<=[.!?])\s+/).filter(Boolean);
  }, [data]);
  const nq = quote ? norm(quote) : "";
  const hitIdx = nq ? lines.findIndex((l) => norm(l).includes(nq.slice(0, 70))) : -1;
  useEffect(() => { if (hitIdx >= 0) document.getElementById(`tl-${hitIdx}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [hitIdx, quote, tab]);

  async function persist(next: Analysis) {
    setAnalysis(next);
    setActionError(null);
    try { await api.saveAnalysis(meetingId, next); } catch (e) { setActionError(errorMessage(e)); }
  }
  function update(row: Row, patch: Record<string, unknown>, review: ReviewStatus) {
    if (!analysis) return;
    const list = analysis[row.kind] as { id: string }[];
    void persist({ ...analysis, [row.kind]: list.map((x) => (x.id === row.id ? { ...x, ...patch, review_status: review } : x)) } as Analysis);
  }
  function saveEdit(row: Row) {
    const field = row.kind === "requirements" ? "title" : row.kind === "commitments" ? "description" : "description";
    const text = row.kind === "commitments" ? draft.replace(/^[^:]+:\s*/, "") : draft;
    update(row, { [field]: text }, "edited");
    setEditing(null);
  }

  const summary: Summary | null | undefined = analysis?.meeting_summary;

  async function copySummary() {
    if (!summary) return;
    const body = [summary.headline, "", summary.executive_summary, "", ...summary.topics.map((t) => `• ${t.title}: ${t.summary}`)].join("\n");
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sem permissão de clipboard */ }
  }

  async function finish() {
    if (!analysis || !data) return;
    setBusy("Concluindo revisão…");
    setActionError(null);
    try {
      if (!analysis.review_completed) await api.completeReview(meetingId, acceptPending || pending === 0);
      // O rascunho é gerado em paralelo desde o processamento (itens pendentes contam como confirmados).
      // Se a revisão rejeitou/editou/marcou itens, gera de novo para refletir a análise revisada.
      const changed = rows.some((r) => r.review === "rejected" || r.review === "edited" || r.review === "needs_clarification");
      const p = !analysis.review_completed && changed
        ? await regenerateProposal(data.project.id, meetingId)
        : await ensureProposal(data.project.id, meetingId);
      router.push(`/proposals/${p}`);
    } catch (e) {
      setActionError(errorMessage(e));
      setBusy(null);
    }
  }

  if (loading) return <AppShell title="Revisão da análise" eyebrow="ANÁLISE"><Loading text="Carregando a análise da reunião…" /></AppShell>;
  if (error || !data || !analysis) return <AppShell title="Revisão da análise" eyebrow="ANÁLISE" action={<Button href="/" variant="secondary">← Projetos</Button>}><ErrorBanner message={error ?? "Análise indisponível."} onRetry={reload} /></AppShell>;

  const locked = analysis.review_completed;
  const proposalExists = Boolean(data.project.latest_proposal_id);

      const mainAction = () => { if (locked || pending === 0 || acceptPending) void finish(); };

  return <AppShell title="Revisão da análise" eyebrow={`${data.project.name.toUpperCase()} / ANÁLISE`}>
    <div className="rv rv-hero">
      <header className="rv-head">
        <div>
          <Badge tone={locked ? "green" : pending === 0 ? "green" : "blue"}>{locked ? "Revisão concluída" : pending === 0 ? "Pronta para a proposta" : "Análise pronta"}</Badge>
        </div>
      </header>

      <ErrorBanner message={actionError} />

      <div className={`rv-split${chatOpen ? "" : " chat-closed"}`}>
        <div className="rv-stack card">
          <Card className="rv-summary">
            {summary ? <>
              <Badge tone="purple">Resumo da negociação · gerado pela IA</Badge>
              <h2>{summary.headline}</h2>
              <p className="lead">{summary.executive_summary}</p>
            </> : <>
              <Badge>Resumo indisponível</Badge>
              <p className="hint">O resumo não foi gerado nesta análise; a revisão pelo assistente continua disponível.</p>
            </>}
          <div className="rv-summary-actions">
            <button type="button" className="button secondary" onClick={() => setTab("items")}>Ver itens detalhados</button>
            <button type="button" className="button secondary" onClick={() => setTab("transcript")}>Ver transcrição</button>
            {(locked || pending === 0) && <button type="button" className="button" disabled={Boolean(busy)} onClick={mainAction}>{busy ?? (locked ? (proposalExists ? "Abrir proposta →" : "Gerar proposta →") : "Gerar proposta →")}</button>}
            {summary && <button type="button" className="button secondary" onClick={copySummary}>{copied ? "✓ Copiado" : "Copiar resumo"}</button>}
          </div>
          </Card>
        </div>

        <div className={`rv-chat-slot${chatOpen ? "" : " closed"}`}>
          <ReviewChat meetingId={meetingId} pending={pending} locked={locked} onAnalysis={setAnalysis} onClose={() => setChatOpen(false)} onGenerate={locked || pending > 0 ? undefined : mainAction} generating={Boolean(busy)} />
        </div>
      </div>

      {!chatOpen && <button type="button" className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Abrir assistente de revisão">
        <span aria-hidden="true">✦</span> Assistente{!locked && pending > 0 ? <b>{pending}</b> : null}
      </button>}

      {drawerOpen && <div className="rv-overlay" onClick={() => setDrawerOpen(false)}>
        <aside className="rv-drawer" role="dialog" aria-label="Itens da análise" onClick={(e) => e.stopPropagation()}>
          <header className="rv-drawer-head">
            <div className="rv-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "items"} className={tab === "items" ? "active" : ""} onClick={() => setTabState("items")}>Itens{pending > 0 && <b>{pending}</b>}</button>
              <button type="button" role="tab" aria-selected={tab === "transcript"} className={tab === "transcript" ? "active" : ""} onClick={() => setTabState("transcript")}>Transcrição</button>
            </div>
            <button type="button" className="rv-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Fechar">×</button>
          </header>
          <div className="rv-drawer-body">
            {tab === "items" && <>
      <div className="rv-kinds">
        <button type="button" className={kindFilter === null ? "active" : ""} onClick={() => setKindFilter(null)}>Todos</button>
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <button type="button" key={k} className={kindFilter === k ? "active" : ""} onClick={() => setKindFilter(k)}>{KIND_LABEL[k]} <b>{rows.filter((r) => r.kind === k).length}</b></button>)}
      </div>
      <div className="review-layout rv-two"><Card className="items-panel"><div className="card-heading"><div><strong>Itens encontrados</strong><small>{rows.length} evidências extraídas da reunião</small></div><Badge tone="blue">{reviewed}/{rows.length} revisados</Badge></div>
      <div className="analysis-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar item ou categoria..." /></div>
      <div className="item-filter"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos <b>{rows.length}</b></button><button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Não revisados <b>{pending}</b></button><button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>Revisados <b>{reviewed}</b></button></div>
      {visible.map((r) => <button className={`review-item ${sel?.key === r.key ? "selected" : ""}`} onClick={() => { setSelected(r.key); setFocusQuote(null); }} key={r.key}><b className={`item-icon ${r.tone}`}>{r.icon}</b><span><small>{r.type}</small><strong>{r.title}</strong><em>{r.refs.length ? "⌁ Citação encontrada" : "Sem citação (ausência detectada)"}</em></span><b className={`item-state ${r.review === "rejected" ? "rejected" : r.review === "needs_clarification" ? "clarify" : r.review === "pending" ? "" : "ok"}`}>{r.review === "pending" ? "○" : r.review === "rejected" ? "×" : r.review === "needs_clarification" ? "?" : "✓"}</b></button>)}
      {!visible.length && <p className="hint">Nenhum item neste filtro.</p>}
      <div className="actions review-actions"><small>{pct}% revisado</small></div>
      {!locked && pending > 0 && <label className="hint"><input type="checkbox" checked={acceptPending} onChange={(e) => setAcceptPending(e.target.checked)} /> Aceitar os {pending} itens pendentes como confirmados (não recomendado fora da demo)</label>}
      <div className="actions review-actions"><Button onClick={finish}>{busy ?? (locked ? (proposalExists ? "Abrir proposta →" : "Gerar proposta →") : "Concluir revisão e gerar proposta →")}</Button></div>
      <p className="hint">Itens rejeitados não entram na proposta; itens “precisa esclarecer” entram como pontos pendentes.</p>
    </Card>

    
      {sel && <Card className="detail"><div className="detail-top"><Badge tone={sel.tone}>{sel.type}</Badge><Badge tone={CONF[sel.confidence]?.tone ?? "neutral"}>{CONF[sel.confidence]?.label ?? sel.confidence}</Badge><span className="detail-id">{sel.id}</span></div>
      {editing === sel.key ? <div className="edit-box"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} /><div className="detail-actions"><Button onClick={() => saveEdit(sel)}>Salvar edição</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button></div></div> : <h2>{sel.title}</h2>}
      {sel.kind === "tech_suggestions" ? <span className="ai">✧ Sugestão da IA, não validada com o cliente</span> : <span className="ai">✦ Estruturado pela IA</span>}
      {sel.detail && <label>Detalhes<p>{sel.detail}</p></label>}
      {sel.refs.map((r, i) => <label key={i}>{i === 0 ? "O que foi dito" : "Outra citação"}<p>“{r.quote}”</p></label>)}
      <div className="detail-meta"><span>Origem <b>{data.meeting.title ?? "Reunião"}</b></span><span>Revisão <b>{REVIEW[sel.review]}</b></span></div>
      {!locked && <div className="detail-actions"><Button variant="secondary" onClick={() => update(sel, {}, "confirmed")}>✓ Confirmar</Button><Button variant="secondary" onClick={() => { setEditing(sel.key); setDraft(sel.kind === "requirements" ? sel.title : sel.title); }}>✎ Editar</Button><Button variant="secondary" onClick={() => update(sel, {}, "needs_clarification")}>? Precisa esclarecer</Button><Button variant="danger" onClick={() => update(sel, {}, "rejected")}>× Rejeitar</Button></div>}
      {sel.refs.length > 0 && <a href="#transcript" onClick={() => { setFocusQuote(null); setTab("transcript"); }}>Ver na transcrição ↗</a>}
    </Card>}

    
      </div>
            </>}
            {tab === "transcript" && <Card className="transcript-panel" id="transcript"><div className="card-heading"><div><h2>Transcrição</h2><p>{String(data.meeting.transcript?.metadata?.provider === "openai" ? "Transcrito pela IA" : "Texto enviado")} · {lines.length} trechos</p></div></div>
      {lines.map((l, i) => <p id={`tl-${i}`} className={`transcript-line ${i === hitIdx ? "hit" : ""}`} key={i}>{l}</p>)}
      {quote && hitIdx < 0 && <div className="transcript-highlight">Citação (não localizada literalmente no texto exibido)<br /><b>“{quote}”</b></div>}
    </Card>}
          </div>
        </aside>
      </div>}
    </div>
  </AppShell>;
}

export default function AnalysisPage() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><AnalysisPageInner /></Suspense>;
}
