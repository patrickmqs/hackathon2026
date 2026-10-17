"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";

type GmailState = "connected" | "configured" | "disconnected";

export default function SettingsPage() {
  const [demoUser, setDemoUser] = useState("Marina Rocha");
  const [draftUser, setDraftUser] = useState("Marina Rocha");
  const [gmailState, setGmailState] = useState<GmailState>("connected");
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedUser = window.localStorage.getItem("proposal-ai-demo-user");
    const storedGmail = window.localStorage.getItem("proposal-ai-gmail");
    if (storedUser) {
      setDemoUser(storedUser);
      setDraftUser(storedUser);
    }
    if (storedGmail === "disconnected") setGmailState("disconnected");
  }, []);

  function saveUser() {
    const nextUser = draftUser.trim();
    if (!nextUser) {
      setMessage("Informe um nome para continuar.");
      return;
    }
    window.localStorage.setItem("proposal-ai-demo-user", nextUser);
    setDemoUser(nextUser);
    setSaved(true);
    setMessage("Usuário demo atualizado.");
    window.setTimeout(() => setSaved(false), 2500);
  }

  function disconnectGmail() {
    window.localStorage.setItem("proposal-ai-gmail", "disconnected");
    setGmailState("disconnected");
    setMessage("Gmail desconectado neste ambiente de demonstração.");
  }

  return <AppShell title="Configurações" eyebrow="WORKSPACE">
    <div className="settings-tabs"><button className="active">Workspace</button><button>Preferências</button><button>Segurança e dados</button></div>
    <div className="form-layout">
      <div>
        <Card>
          <div className="card-heading"><div><h2>Usuário da demonstração</h2><p>Este nome identifica quem revisa, aprova e autoriza envios.</p></div><Badge tone="amber">Modo demonstração</Badge></div>
          <label>Seu nome<input value={draftUser} onChange={(event) => setDraftUser(event.target.value)} placeholder="Digite seu nome" /></label>
          <div className="settings-save"><Button onClick={saveUser}>Salvar alterações</Button>{saved && <span className="save-feedback">✓ Salvo</span>}</div>
          <p className="muted">Identidade atual: <strong>{demoUser}</strong>. Isto não é autenticação, apenas rastreabilidade.</p>
        </Card>
        <Card>
          <div className="card-heading"><div><h2>Integrações</h2><p>Conecte os canais para enviar propostas diretamente.</p></div><span className="integration-health">● Operacional</span></div>
          <div className="integration"><b className="channel gmail">M</b><span><strong>Gmail</strong><small>{gmailState === "connected" ? "Conectado como marina@acme.io" : gmailState === "configured" ? "Configurado, aguardando conexão" : "Nenhuma conta conectada"}</small></span><Badge tone={gmailState === "connected" ? "green" : gmailState === "configured" ? "blue" : "red"}>{gmailState === "connected" ? "Conectado" : gmailState === "configured" ? "Configurado" : "Desconectado"}</Badge>{gmailState === "connected" ? <Button variant="secondary" onClick={disconnectGmail}>Desconectar</Button> : <a className="button secondary" href="/api/v1/auth/google/start">Conectar Gmail</a>}</div>
          <div className="integration"><b className="channel whatsapp">◔</b><span><strong>WhatsApp Business</strong><small>O status é controlado pelo backend. Credenciais nunca são exibidas aqui.</small></span><Badge>Não configurado</Badge><a className="integration-link" href="https://github.com/patrickmqs/hackathon2026/blob/main/docs/INTEGRATIONS.md" target="_blank" rel="noreferrer">Como conectar ↗</a></div>
        </Card>
        {message && <div className={`settings-message ${message.includes("atualizado") ? "success" : ""}`}>{message}</div>}
      </div>
      <aside className="info settings-info"><b>⌘</b><h2>Seus dados estão seguros</h2><p>Credenciais de integração ficam no backend e nunca são expostas no frontend ou incluídas nas propostas.</p><div className="security-item"><span>✓</span><p>Escopo mínimo de envio</p></div><div className="security-item"><span>✓</span><p>Sem acesso à sua caixa de entrada</p></div><div className="security-item"><span>✓</span><p>Você controla cada autorização</p></div></aside>
    </div>
  </AppShell>;
}
