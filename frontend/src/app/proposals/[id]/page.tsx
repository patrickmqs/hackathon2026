"use client";
import { useParams } from "next/navigation";
import { useState, Suspense } from "react";
import { AppShell, Badge, Button } from "@/components/AppShell";
import { ErrorBanner, Loading, errorMessage, useLoad } from "@/components/Api";
import { api } from "@/lib/api";

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
    setEmail(project.client.contact_email ?? "");
    setPhone(project.client.contact_phone ?? "");
    setActionError(null);
    setSent(false);
    setSendOpen(true);
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
      // Persiste o que o usuário preencheu para os próximos envios.
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

  return <AppShell title="Proposta comercial" eyebrow="PROPOSTA">
    <div className="proposal-pdf-view">
      <header className="proposal-pdf-head">
        <div>
          <Badge tone={tone}>{statusLabel} v{version.number}</Badge>
          <h2>{version.content.title}</h2>
          <p>{version.content.client.company}</p>
        </div>
        <div className="proposal-pdf-actions">
          {approved
            ? <Button onClick={openSend}>Preparar envio</Button>
            : <Button onClick={() => setAuthOpen(true)}>Aprovar esta versão</Button>}
        </div>
      </header>

      <ErrorBanner message={actionError} />

      <div className="proposal-pdf-frame">
        <iframe className="pdf-frame" title="PDF da proposta" src={api.pdfUrl(proposal.id, version.number)} />
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
