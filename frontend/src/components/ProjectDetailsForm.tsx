"use client";
import { useState } from "react";
import { Card, Button } from "@/components/AppShell";
import { ErrorBanner, errorMessage } from "@/components/Api";
import { PLACEHOLDER_COMPANY, PLACEHOLDER_PROJECT_NAME, api, type Project } from "@/lib/api";

/** Dados do projeto que a IA não conseguiu extrair da reunião. */
export function isProjectIncomplete(project: Project): boolean {
  return project.name === PLACEHOLDER_PROJECT_NAME || !project.client.company || project.client.company === PLACEHOLDER_COMPANY;
}

// Informações do Cliente: nome, empresa e contato (nome, e-mail e telefone). Recolhível — expande
// ao clicar. Persistido via PATCH /projects/:id e reutilizado na proposta e no envio.
export function ProjectDetailsForm({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const unnamed = project.name === PLACEHOLDER_PROJECT_NAME;
  const noCompany = !project.client.company || project.client.company === PLACEHOLDER_COMPANY;
  const incomplete = isProjectIncomplete(project);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: unnamed ? "" : project.name,
    company: noCompany ? "" : project.client.company ?? "",
    contact: project.client.contact_name ?? "",
    email: project.client.contact_email ?? "",
    phone: project.client.contact_phone ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateProject(project.id, {
        ...(f.name.trim() ? { name: f.name.trim() } : {}),
        client: {
          ...(f.company.trim() ? { company: f.company.trim() } : {}),
          contact_name: f.contact.trim() || null,
          contact_email: f.email.trim() || null,
          contact_phone: f.phone.trim() || null,
        },
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return <Card className="client-info-card">
    <button type="button" className="client-info-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      <span className="client-info-title">
        <span className={`client-info-chevron${open ? " open" : ""}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span>
        <strong>Informações do Cliente</strong>
      </span>
      {incomplete && <span className="client-alert"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l9 16H3z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></svg>Dados incompletos</span>}
    </button>
    {open && <div className="client-info-body">
      <p className="client-info-desc">{incomplete
        ? "A IA não encontrou alguns dados na conversa. Informe para identificar o projeto e preencher a proposta."
        : "Dados do cliente usados na proposta e no envio."}</p>
      <div className="form-grid">
        <label className="full">Nome do projeto<input value={f.name} onChange={set("name")} placeholder="Ex.: Portal de Pedidos B2B" /></label>
        <label>Empresa do cliente<input value={f.company} onChange={set("company")} placeholder="Ex.: Distribuidora Horizonte" /></label>
        <label>Nome do contato <small>(opcional)</small><input value={f.contact} onChange={set("contact")} placeholder="Ana Souza" /></label>
        <label>E-mail do contato <small>(opcional)</small><input type="email" value={f.email} onChange={set("email")} placeholder="ana@empresa.com" /></label>
        <label>Telefone do contato <small>(opcional)</small><input type="tel" value={f.phone} onChange={set("phone")} placeholder="+55 11 99999-0000" /></label>
      </div>
      <ErrorBanner message={error} />
      <div className="actions"><Button onClick={save}>{busy ? "Salvando…" : "Salvar dados"}</Button></div>
    </div>}
  </Card>;
}
