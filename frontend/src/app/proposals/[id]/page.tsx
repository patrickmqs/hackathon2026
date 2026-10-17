"use client";
import { useParams } from "next/navigation";
import { useState, Suspense } from "react";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { ErrorBanner, Loading, errorMessage, useLoad } from "@/components/Api";
import { api, type ProposalContent } from "@/lib/api";

type Section = { id: string; title: string; editable?: "text" | "lines"; ai?: boolean };
const SECTIONS: Section[] = [
  { id: "exec", title: "Sumário executivo", editable: "text" },
  { id: "ctx", title: "O desafio", editable: "text" },
  { id: "obj", title: "Objetivos", editable: "lines" },
  { id: "scope", title: "Escopo" },
  { id: "mods", title: "Módulos e funcionalidades" },
  { id: "arch", title: "Arquitetura", editable: "text", ai: true },
  { id: "est", title: "Estimativas" },
  { id: "sched", title: "Cronograma" },
  { id: "comm", title: "Investimento" },
  { id: "risk", title: "Riscos e pontos pendentes" },
  { id: "next", title: "Próximos passos", editable: "lines" },
];

function getValue(c: ProposalContent, id: string): string {
  if (id === "exec") return c.executive_summary;
  if (id === "ctx") return c.business_context;
  if (id === "arch") return c.architecture.overview;
  if (id === "obj") return c.objectives.join("\n");
  if (id === "next") return c.next_steps.join("\n");
  return "";
}
function setValue(c: ProposalContent, id: string, v: string): ProposalContent {
  const lines = v.split("\n").map((l) => l.trim()).filter(Boolean);
  if (id === "exec") return { ...c, executive_summary: v };
  if (id === "ctx") return { ...c, business_context: v };
  if (id === "arch") return { ...c, architecture: { ...c.architecture, overview: v } };
  if (id === "obj") return { ...c, objectives: lines };
  if (id === "next") return { ...c, next_steps: lines };
  return c;
}

function ProposalPageInner() {
  const { id } = useParams<{ id: string }>();
  const [n, setN] = useState<number | null>(null);
  const [tab, setTab] = useState<"editar" | "pdf" | "versoes">("editar");
  const [secId, setSecId] = useState("exec");
  const [edit, setEdit] = useState<{ key: string; content: ProposalContent } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stamps, setStamps] = useState<Record<string, number>>({});

  const { data, error, loading, reload } = useLoad(async () => {
    const proposal = await api.getProposal(id);
    const num = n ?? proposal.current_version;
    const version = await api.getVersion(id, num);
    return { proposal, version };
  }, [id, n]);


  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setActionError(null);
    try { return await fn(); } catch (e) { setActionError(errorMessage(e)); } finally { setBusy(null); }
  }

  if (loading && !data) return <AppShell title="Proposta comercial" eyebrow="PROPOSTA"><Loading text="Carregando a proposta…" /></AppShell>;
  if (error || !data) return <AppShell title="Proposta comercial" eyebrow="PROPOSTA" action={<Button href="/" variant="secondary">← Projetos</Button>}><ErrorBanner message={error ?? "Proposta indisponível."} onRetry={reload} /></AppShell>;

  const { proposal, version } = data;
  // Estado derivado: o rascunho só vale para esta versão/hash; ao trocar de versão volta ao conteúdo salvo.
  const editKey = `${id}:${version.number}:${version.content_hash}`;
  const draft: ProposalContent = edit?.key === editKey ? edit.content : version.content;
  const setDraft = (content: ProposalContent) => setEdit({ key: editKey, content });
  const dirty = JSON.stringify(draft) !== JSON.stringify(version.content);
  const stampKey = `${id}:${version.number}`;
  const pdfStamp: number | null = stamps[stampKey] ?? (version.pdf ? new Date(version.pdf.generated_at).getTime() : null);
  const setPdfStamp = (t: number) => setStamps((m) => ({ ...m, [stampKey]: t }));
  const approved = version.status === "approved";
  const editable = version.status === "draft";
  const sec = SECTIONS.find((s) => s.id === secId)!;
  const c = draft;
  const tone = approved ? "green" : version.status === "superseded" ? "neutral" : "amber";
  const statusLabel = approved ? "Aprovada" : version.status === "superseded" ? "Substituída" : "Rascunho";

  const readonlyBody = (): React.ReactNode => {
    switch (secId) {
      case "scope": return <><strong>Dentro do escopo</strong><ul>{c.scope.in_scope.map((x, i) => <li key={i}>{x}</li>)}</ul><strong>Fora do escopo</strong><ul>{(c.scope.out_of_scope.length ? c.scope.out_of_scope : ["Nenhum item registrado"]).map((x, i) => <li key={i}>{x}</li>)}</ul></>;
      case "mods": return <div className="stack">{c.modules.map((m) => <div key={m.id}><strong>{m.name} <Badge>{m.complexity}</Badge></strong><p>{m.description}</p>{m.features.length > 0 && <ul>{m.features.map((f, i) => <li key={i}>{f}</li>)}</ul>}</div>)}</div>;
      case "est": return <><div className="kv"><span>Horas estimadas</span><b>{c.estimates.total_hours_min}–{c.estimates.total_hours_max} h</b></div><div className="kv"><span>Prazo</span><b>{c.total_weeks} semanas</b></div><div className="kv"><span>Confiança</span><b>{c.estimates.confidence}</b></div><p className="hint">{c.estimates.basis_label}. Calculado pelo motor de regras determinístico, não pela IA.</p><ul>{c.estimates.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></>;
      case "sched": return <ul>{c.schedule.map((s) => <li key={s.name}>{s.name}: {s.duration_weeks} semana(s)</li>)}</ul>;
      case "comm": return <><div className="kv"><span>Situação</span><b>{c.commercial.status === "demo_rates" ? "Valores demonstrativos" : "A definir"}</b></div><p className="hint">{c.commercial.disclaimer}</p></>;
      case "risk": return <><strong>Riscos</strong><ul>{(c.risks.length ? c.risks : [{ description: "Nenhum risco registrado", mitigation: "" }]).map((r, i) => <li key={i}>{r.description}{r.mitigation ? ` — ${r.mitigation}` : ""}</li>)}</ul><strong>Pontos em aberto</strong><ul>{c.open_points.map((p, i) => <li key={i}>{p.description}{p.question ? ` — ${p.question}` : ""}</li>)}</ul></>;
      default: return null;
    }
  };

  return <AppShell title="Proposta comercial" eyebrow="PROPOSTA" action={approved ? <Button href={`/proposals/${id}/deliveries/new`}>Preparar envio →</Button> : undefined}>
    <div className="proposal-head"><div><Badge tone={tone}>{statusLabel} v{version.number}</Badge><h2>{c.title}</h2><p>{c.client.company} · criada por {version.created_by}</p></div>
      <select value={version.number} onChange={(e) => setN(Number(e.target.value))}>{proposal.versions.map((v) => <option key={v.number} value={v.number}>Versão {v.number} ({v.status})</option>)}</select></div>
    <ErrorBanner message={actionError} />
    {approved && version.approval && <p className="success">Aprovada por {version.approval.approved_by} em {new Date(version.approval.approved_at).toLocaleString("pt-BR")}. Esta versão é imutável: para alterar, crie uma nova versão.</p>}
    <div className="proposal-tabs">{(["editar", "pdf", "versoes"] as const).map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "editar" ? "Editar" : t === "pdf" ? "Pré-visualizar PDF" : "Versões"}</button>)}</div>

    {tab === "editar" && <div className="proposal-layout">
      <Card className="section-nav nav-sections"><strong>Seções da proposta</strong>{SECTIONS.map((s, i) => <p className={s.id === secId ? "selected" : ""} onClick={() => setSecId(s.id)} key={s.id}>{String(i + 1).padStart(2, "0")} {s.title}</p>)}</Card>
      <Card className="editor">{sec.ai && c.architecture.is_ai_suggestion && <Badge tone="purple">Sugestão da IA</Badge>}<small>{String(SECTIONS.indexOf(sec) + 1).padStart(2, "0")} / {SECTIONS.length}</small><h2>{sec.title}</h2>
        {sec.editable ? <><p className="hint">{sec.editable === "lines" ? "Um item por linha." : "Edite o texto abaixo."}</p><textarea rows={10} disabled={!editable} value={getValue(c, secId)} onChange={(e) => setDraft(setValue(c, secId, e.target.value))} /></> : <div className="stack">{readonlyBody()}<p className="hint">Esta seção é montada a partir da análise revisada e do motor de estimativas; não é editada à mão.</p></div>}
        <div className="actions"><small>{dirty ? "Alterações não salvas" : "Sem alterações"}</small>
          <Button variant="secondary" onClick={() => void run("Salvando…", async () => { const v = await api.createVersion(id, draft); setN(v.number); await reload(); })}>{busy === "Salvando…" ? "Salvando…" : approved ? "Criar nova versão a partir desta" : "Salvar como nova versão"}</Button></div>
      </Card>
      <Card className="proposal-summary"><h2>Resumo da versão</h2><p>Estimativa <b>{c.estimates.total_hours_min}–{c.estimates.total_hours_max} h</b></p><p>Prazo <b>{c.total_weeks} semanas</b></p><p>Módulos <b>{c.modules.length}</b></p><hr /><small>Estimativas calculadas pelo motor de regras a partir dos módulos revisados.</small>
        <Button variant="secondary" onClick={() => setTab("pdf")}>Ver PDF</Button>
        {editable && !dirty && <><hr /><label className="hint">Nota da aprovação (opcional)<input value={note} onChange={(e) => setNote(e.target.value)} /></label><Button onClick={() => void run("Aprovando…", async () => { await api.approve(id, version.number, version.content_hash, note || undefined); await reload(); })}>{busy === "Aprovando…" ? "Aprovando…" : "Aprovar esta versão"}</Button><small>Aprova o conteúdo exato desta versão (hash {version.content_hash.slice(0, 10)}…).</small></>}
        {editable && dirty && <p className="hint">Salve as alterações como nova versão antes de aprovar.</p>}
      </Card></div>}

    {tab === "pdf" && <Card className="pdf-preview"><h2>Pré-visualização do PDF · v{version.number}</h2>
      <div className="row"><Button onClick={() => void run("Gerando PDF…", async () => { await api.generatePdf(id, version.number); setPdfStamp(Date.now()); await reload(); })}>{busy === "Gerando PDF…" ? "Gerando…" : pdfStamp ? "Atualizar PDF" : "Gerar PDF"}</Button>{pdfStamp && <Button variant="secondary" href={api.pdfUrl(id, version.number, true)}>Baixar</Button>}</div>
      {pdfStamp ? <iframe className="pdf-frame" title="PDF da proposta" src={`${api.pdfUrl(id, version.number)}#t=${pdfStamp}`} /> : <p className="hint">Clique em “Gerar PDF” para ver o documento desta versão.</p>}
    </Card>}

    {tab === "versoes" && <Card className="pdf-preview"><h2>Histórico de versões</h2>{proposal.versions.map((v) => <div className="kv" key={v.number}><span>v{v.number} · {v.status} · {v.created_by} · {new Date(v.created_at).toLocaleString("pt-BR")}</span><Button variant="secondary" onClick={() => { setN(v.number); setTab("editar"); }}>Abrir</Button></div>)}</Card>}
  </AppShell>;
}

export default function ProposalPage() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><ProposalPageInner /></Suspense>;
}
