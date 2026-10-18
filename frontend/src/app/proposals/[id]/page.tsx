"use client";
import { useParams } from "next/navigation";
import { useState, Suspense } from "react";
import { AppShell, Badge, Button } from "@/components/AppShell";
import { ErrorBanner, Loading, errorMessage, useLoad } from "@/components/Api";
import { api } from "@/lib/api";
import { DEMO_CONTACT, DEMO_ENABLED } from "@/lib/demo-mock";

function ProposalPageInner() {
  const { id } = useParams<{ id: string }>();
  const [approving, setApproving] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    const proposal = await api.getProposal(id);
    const version = await api.getVersion(id, proposal.current_version);
    const project = await api.getProject(proposal.project_id);
    return { proposal, version, project };
  }, [id]);

  if (loading && !data) return <AppShell title="Proposta comercial" eyebrow="PROPOSTA"><Loading text="Carregando a proposta…" /></AppShell>;
  if (error || !data) return <AppShell title="Proposta comercial" eyebrow="PROPOSTA" action={<Button href="/" variant="secondary">← Projetos</Button>}><ErrorBanner message={error ?? "Proposta indisponível."} onRetry={reload} /></AppShell>;

  const { proposal, version, project } = data;
  const approved = version.status === "approved";
  const tone = approved ? "green" : "amber";
  const statusLabel = approved ? "Aprovada" : "Rascunho";

  function openSend() {
    setEmail(DEMO_ENABLED ? DEMO_CONTACT.email : project.client.contact_email ?? "");
    setPhone(DEMO_ENABLED ? DEMO_CONTACT.phone : project.client.contact_phone ?? "");
    setActionError(null);
    setSent(false);
    setSendOpen(true);
  }

  async function copyLink() {
    const url = `${window.location.origin}/proposals/${proposal.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }

  async function authorizeSend() {
    setApproving(true);
    setActionError(null);
    try {
      await api.approve(proposal.id, version.number, version.content_hash);
      setAuthOpen(false);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
      setApproving(false);
    }
  }

  async function sendDelivery() {
    if (!version.approval) return;
    const emailVal = email.trim();
    const phoneVal = phone.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setActionError("E-mail inválido.");
      return;
    }
    if (phoneVal && !/^\+[1-9]\d{6,14}$/.test(phoneVal)) {
      setActionError("Telefone inválido (use o formato +55 11 99999-0000).");
      return;
    }
    if (!emailVal && !phoneVal) {
      setActionError("Informe ao menos um e-mail ou telefone para enviar.");
      return;
    }

    const company = project.client.company ?? "você";
    const name = project.client.contact_name ?? null;
    const channels: { channel: string; recipient: Record<string, unknown>; options?: Record<string, unknown> }[] = [];
    if (emailVal) {
      channels.push({
        channel: "gmail",
        recipient: { email: emailVal, name },
        options: { subject: `Proposta comercial — ${version.content.title}`, body_text: `Olá! Segue a proposta comercial para ${company}.` },
      });
    }
    if (phoneVal) {
      channels.push({
        channel: "whatsapp",
        recipient: { phone: phoneVal, name },
        options: { caption: `Olá! Segue a proposta comercial para ${company}.` },
      });
    }

    setSending(true);
    setActionError(null);
    try {
      await api.updateProject(project.id, { client: { contact_email: emailVal || null, contact_phone: phoneVal || null } });
      await api.createDelivery({
        approval_id: version.approval.id,
        idempotency_key: crypto.randomUUID(),
        channels,
      });
      setSent(true);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const topbarActions = (
    <div className="proposal-topbar-actions">
      <button type="button" className="btn-copy-link" onClick={copyLink} title="Copiar link da proposta">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
        {linkCopied ? "Link copiado!" : "Copiar link"}
      </button>
      {approved
        ? <button type="button" className="btn-approve" onClick={openSend}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            Preparar envio
          </button>
        : <button type="button" className="btn-approve" onClick={() => setAuthOpen(true)}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Aprovar proposta
          </button>}
    </div>
  );

  return <AppShell title={`Proposta v${version.number}`} eyebrow="PROPOSTA" action={topbarActions}>
    <div className="proposal-viewer">
      <div className="proposal-viewer-toolbar">
        <div className="proposal-viewer-meta">
          <Badge tone={tone}>{statusLabel} v{version.number}</Badge>
          <span className="proposal-viewer-title">{version.content.title}</span>
          <span className="proposal-viewer-sep">·</span>
          <span className="proposal-viewer-client">{version.content.client.company}</span>
        </div>
      </div>

      <ErrorBanner message={actionError} />

      <div className="proposal-viewer-frame">
        <iframe className="proposal-viewer-iframe" title="PDF da proposta" src={api.pdfUrl(proposal.id, version.number)} />
      </div>
    </div>

    {authOpen && (
      <div className="modal-backdrop" onClick={() => { if (!approving) setAuthOpen(false); }}>
        <div className="report-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setAuthOpen(false)} aria-label="Fechar">×</button>
          <span className="report-icon">✉</span>
          <h2>Autorizar envio ao cliente?</h2>
          <p>Ao aprovar a versão v{version.number}, você autoriza o envio desta proposta para <strong>{version.content.client.company}</strong>.</p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setAuthOpen(false)}>Cancelar</Button>
            <Button onClick={() => void authorizeSend()}>{approving ? "Aprovando…" : "Autorizar envio"}</Button>
          </div>
        </div>
      </div>
    )}

    {sendOpen && (
      <div className="modal-backdrop" onClick={() => { if (!sending && !sent) setSendOpen(false); }}>
        <div className="report-modal send-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setSendOpen(false)} aria-label="Fechar">×</button>
          {sent ? (
            <>
              <span className="report-icon">✓</span>
              <h2>Proposta enviada!</h2>
              <p>O envio foi iniciado para os canais configurados.</p>
              <div className="modal-actions"><Button onClick={() => setSendOpen(false)}>Fechar</Button></div>
            </>
          ) : (
            <>
              <span className="report-icon">✉</span>
              <h2>Confirmar envio ao cliente</h2>
              <p className="send-client">Revise e complete os dados do cliente antes de enviar.</p>
              <div className="send-client-box">
                <div className="kv"><span>Empresa</span><b>{project.client.company ?? "—"}</b></div>
                <div className="kv"><span>Contato</span><b>{project.client.contact_name ?? "—"}</b></div>
                <label className="send-field">E-mail do cliente
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com" autoFocus />
                </label>
                <label className="send-field">Telefone do cliente
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-0000" />
                </label>
              </div>
              <ErrorBanner message={actionError} />
              <div className="modal-actions">
                <Button variant="secondary" onClick={() => setSendOpen(false)}>Cancelar</Button>
                <Button onClick={() => void sendDelivery()}>{sending ? "Enviando…" : "Enviar"}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
  </AppShell>;
}

export default function ProposalPage() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><ProposalPageInner /></Suspense>;
}
