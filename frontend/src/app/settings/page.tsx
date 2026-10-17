"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { WhatsAppConnectModal } from "@/components/WhatsAppConnectModal";
import { errorMessage } from "@/components/Api";
import { api, type WhatsappStatus } from "@/lib/api";

type GmailState = "connected" | "configured" | "disconnected";

export default function SettingsPage() {
  const [demoUser, setDemoUser] = useState("Marina Rocha");
  const [draftUser, setDraftUser] = useState("Marina Rocha");
  const [gmailState, setGmailState] = useState<GmailState>("connected");
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  const [whatsapp, setWhatsapp] = useState<WhatsappStatus | null>(null);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = window.localStorage.getItem("proposal-ai-demo-user");
    const storedGmail = window.localStorage.getItem("proposal-ai-gmail");
    if (storedUser) {
      setDemoUser(storedUser);
      setDraftUser(storedUser);
    }
    if (storedGmail === "disconnected") setGmailState("disconnected");
    void refreshWhatsapp();
  }, []);

  async function refreshWhatsapp() {
    try {
      setWhatsapp(await api.whatsappStatus());
    } catch {
      setWhatsapp(null);
    }
  }

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

  async function disconnectWhatsapp() {
    setDisconnecting(true);
    setMessage("");
    try {
      await api.whatsappDisconnect();
      setMessage("WhatsApp desconectado.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setDisconnecting(false);
      await refreshWhatsapp();
    }
  }

  async function sendTest() {
    const phone = testPhone.trim();
    setTestResult(null);
    setTestError(null);
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      setTestError("Informe o número em E.164 (ex. +5511999990000).");
      return;
    }
    setTestBusy(true);
    try {
      const result = await api.whatsappTest(phone);
      if (result.ok) {
        setTestResult("Mensagem de teste enviada! Confira o WhatsApp do destinatário.");
      } else {
        setTestError(result.error ?? "Não foi possível enviar a mensagem de teste.");
      }
    } catch (e) {
      setTestError(errorMessage(e));
    } finally {
      setTestBusy(false);
    }
  }

  const whatsappConnected = whatsapp?.connected === true;

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
          <div className="integration"><b className="channel whatsapp">◔</b><span><strong>WhatsApp</strong><small>{whatsappConnected ? (whatsapp?.phone_number ? `Conectado como ${whatsapp.phone_number}` : "Conectado") : "Conecte sua conta para enviar pelo WhatsApp."}</small></span><Badge tone={whatsappConnected ? "green" : "red"}>{whatsappConnected ? "Conectado" : "Não conectado"}</Badge><div className="wa-actions">{whatsappConnected ? <Button variant="secondary" onClick={() => void disconnectWhatsapp()}>{disconnecting ? "Desconectando…" : "Desconectar"}</Button> : <Button variant="secondary" onClick={() => setWhatsappModalOpen(true)}>Conectar</Button>}<Button variant="secondary" onClick={() => setTestMode((value) => !value)}>Teste</Button></div></div>
          {testMode && <div className="wa-test-row"><input value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="+5511999990000" aria-label="Número para envio de teste" /><Button variant="secondary" onClick={() => void sendTest()}>{testBusy ? "Enviando…" : "Enviar \"oi\""}</Button></div>}
          {testResult && <p className="settings-message success">{testResult}</p>}
          {testError && <p className="settings-message">{testError}</p>}
        </Card>
        {message && <div className={`settings-message ${message.includes("atualizado") ? "success" : ""}`}>{message}</div>}
      </div>
      <aside className="info settings-info"><b>⌘</b><h2>Seus dados estão seguros</h2><p>Credenciais de integração ficam no backend e nunca são expostas no frontend ou incluídas nas propostas.</p><div className="security-item"><span>✓</span><p>Escopo mínimo de envio</p></div><div className="security-item"><span>✓</span><p>Sem acesso à sua caixa de entrada</p></div><div className="security-item"><span>✓</span><p>Você controla cada autorização</p></div></aside>
    </div>
    <WhatsAppConnectModal open={whatsappModalOpen} onClose={() => setWhatsappModalOpen(false)} onConnected={() => void refreshWhatsapp()} />
  </AppShell>;
}
