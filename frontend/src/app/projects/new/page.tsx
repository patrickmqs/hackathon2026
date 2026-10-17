"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell, Button, Card } from "@/components/AppShell";
import { ErrorBanner, errorMessage } from "@/components/Api";
import { api } from "@/lib/api";

export default function NewProject() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", company: "", description: "", contact: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valid = f.name.trim() && f.company.trim();

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.createProject({
        name: f.name.trim(),
        description: f.description.trim() || null,
        client: { company: f.company.trim(), contact_name: f.contact.trim() || null, contact_email: f.email.trim() || null, contact_phone: f.phone.trim() || null },
      });
      router.push(`/projects/${p.id}/meetings/new`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return <AppShell title="Novo projeto" eyebrow="PROJETOS / NOVO"><div className="form-layout"><div>
    <Card><h2>Sobre o projeto</h2><p>Comece com as informações essenciais do trabalho.</p><div className="form-grid">
      <label>Nome do projeto<input value={f.name} onChange={set("name")} placeholder="Ex.: Portal de Pedidos B2B" /></label>
      <label>Empresa do cliente<input value={f.company} onChange={set("company")} placeholder="Ex.: Distribuidora Horizonte" /></label>
      <label className="full">Descrição<textarea rows={4} value={f.description} onChange={set("description")} placeholder="Qual problema o projeto resolve?" /></label>
    </div></Card>
    <Card><h2>Contato principal</h2><p>Usaremos estes dados para preencher a proposta.</p><div className="form-grid">
      <label>Nome do contato<input value={f.contact} onChange={set("contact")} placeholder="Ana Souza" /></label>
      <label>E-mail<input type="email" value={f.email} onChange={set("email")} placeholder="ana@empresa.com" /></label>
      <label>Telefone <small>(opcional)</small><input value={f.phone} onChange={set("phone")} placeholder="+55 (11) 99999-0000" /></label>
    </div></Card>
    <ErrorBanner message={error} />
    <div className="actions"><Button variant="secondary" href="/">Cancelar</Button><Button onClick={submit}>{busy ? "Criando…" : "Criar e adicionar reunião →"}</Button></div>
    {!valid && <p className="hint">Informe o nome do projeto e a empresa do cliente.</p>}
  </div><aside className="info"><b>✦</b><h2>Da conversa à proposta</h2><p>A IA organiza sua reunião em requisitos, decisões e pendências. Você revisa tudo antes de gerar a proposta.</p></aside></div></AppShell>;
}
