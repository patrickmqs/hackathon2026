"use client";
import { useParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { AppShell, Badge, Button } from "@/components/AppShell";
import { ErrorBanner, Loading, errorMessage, useLoad } from "@/components/Api";
import { api } from "@/lib/api";

function ProposalPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    const proposal = await api.getProposal(id);
    const version = await api.getVersion(id, proposal.current_version);
    return { proposal, version };
  }, [id]);

  if (loading && !data) return <AppShell title="Proposta comercial" eyebrow="PROPOSTA"><Loading text="Carregando a proposta…" /></AppShell>;
  if (error || !data) return <AppShell title="Proposta comercial" eyebrow="PROPOSTA" action={<Button href="/" variant="secondary">← Projetos</Button>}><ErrorBanner message={error ?? "Proposta indisponível."} onRetry={reload} /></AppShell>;

  const { proposal, version } = data;
  const approved = version.status === "approved";
  const tone = approved ? "green" : "amber";
  const statusLabel = approved ? "Aprovada" : "Rascunho";

  async function authorizeSend() {
    setApproving(true);
    setActionError(null);
    try {
      await api.approve(proposal.id, version.number, version.content_hash);
      setAuthOpen(false);
      await reload();
      router.push(`/proposals/${proposal.id}/deliveries/new`);
    } catch (e) {
      setActionError(errorMessage(e));
      setApproving(false);
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
            ? <Button href={`/proposals/${proposal.id}/deliveries/new`}>Preparar envio →</Button>
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
            <Button onClick={() => void authorizeSend()}>{approving ? "Autorizando…" : "Autorizar envio"}</Button>
          </div>
        </div>
      </div>
    )}
  </AppShell>;
}

export default function ProposalPage() {
  return <Suspense fallback={<AppShell title="Carregando…"><p className="api-loading">Carregando…</p></AppShell>}><ProposalPageInner /></Suspense>;
}
