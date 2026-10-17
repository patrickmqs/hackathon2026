"use client";
import { useState } from "react";
import { Card, Button } from "@/components/AppShell";
import { ErrorBanner, errorMessage } from "@/components/Api";
import { PLACEHOLDER_COMPANY, PLACEHOLDER_PROJECT_NAME, api, type Project } from "@/lib/api";

/** Dados do projeto que a IA não conseguiu extrair da reunião e que ainda faltam. */
export function isProjectIncomplete(project: Project): boolean {
  return project.name === PLACEHOLDER_PROJECT_NAME || !project.client.company || project.client.company === PLACEHOLDER_COMPANY;
}

// Preenchimento posterior de nome e empresa (e contato, opcional) quando a análise da reunião
// não encontrou essas informações na conversa.
export function ProjectDetailsForm({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const unnamed = project.name === PLACEHOLDER_PROJECT_NAME;
  const noCompany = !project.client.company || project.client.company === PLACEHOLDER_COMPANY;
  const [f, setF] = useState({
    name: unnamed ? "" : project.name,
    company: noCompany ? "" : project.client.company ?? "",
    contact: project.client.contact_name ?? "",
    email: project.client.contact_email ?? "",
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
        },
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return <Card>
    <h2>Complete os dados do projeto</h2>
    <p>A IA não encontrou {[unnamed && "o nome do projeto", noCompany && "a empresa do cliente"].filter(Boolean).join(" e ")} na conversa. Informe para identificar este projeto e preencher a proposta.</p>
    <div className="form-grid">
      <label>Nome do projeto<input value={f.name} onChange={set("name")} placeholder="Ex.: Portal de Pedidos B2B" /></label>
      <label>Empresa do cliente<input value={f.company} onChange={set("company")} placeholder="Ex.: Distribuidora Horizonte" /></label>
      <label>Nome do contato <small>(opcional)</small><input value={f.contact} onChange={set("contact")} placeholder="Ana Souza" /></label>
      <label>E-mail do contato <small>(opcional)</small><input type="email" value={f.email} onChange={set("email")} placeholder="ana@empresa.com" /></label>
    </div>
    <ErrorBanner message={error} />
    <div className="actions"><Button onClick={save}>{busy ? "Salvando…" : "Salvar dados"}</Button></div>
  </Card>;
}
