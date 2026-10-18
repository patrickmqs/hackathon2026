"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { WhatsAppConnectModal } from "@/components/WhatsAppConnectModal";
import { errorMessage } from "@/components/Api";
import { api, type GmailStatus, type WhatsappStatus } from "@/lib/api";

export default function SettingsPage() {
  const [demoUser, setDemoUser] = useState("Marina Rocha");
  const [draftUser, setDraftUser] = useState("Marina Rocha");
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);
  const [gmailTestMode, setGmailTestMode] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [gmailTestBusy, setGmailTestBusy] = useState(false);
  const [gmailTestResult, setGmailTestResult] = useState<string | null>(null);
  const [gmailTestError, setGmailTestError] = useState<string | null>(null);

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
    if (storedUser) {
      setDemoUser(storedUser);
      setDraftUser(storedUser);
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      setMessage("Gmail conectado com sucesso.");
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("gmail") === "error") {
      setMessage("Não foi possível conectar o Gmail. Tente novamente.");
      window.history.replaceState({}, "", "/settings");
    }
    void refreshGmail();
    void refreshWhatsapp();
  }, []);

  async function refreshGmail() {
    try {
      setGmail(await api.gmailStatus());
    } catch {
      setGmail(null);
    }
  }

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

  async function sendGmailTest() {
    const email = testEmail.trim();
    setGmailTestResult(null);
    setGmailTestError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGmailTestError("Informe um e-mail válido (ex. cliente@empresa.com).");
      return;
    }
    setGmailTestBusy(true);
    try {
      const result = await api.gmailTest(email);
      if (result.ok) {
        setGmailTestResult("E-mail de teste enviado! Confira a caixa de entrada do destinatário.");
      } else {
        setGmailTestError(result.error ?? "Não foi possível enviar o e-mail de teste.");
      }
    } catch (e) {
      setGmailTestError(errorMessage(e));
    } finally {
      setGmailTestBusy(false);
    }
  }

  function connectGmail() {
    window.location.href = api.gmailStartUrl();
  }

  async function disconnectGmail() {
    setGmailDisconnecting(true);
    setMessage("");
    try {
      await api.gmailDisconnect();
      setMessage("Gmail desconectado.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setGmailDisconnecting(false);
      await refreshGmail();
    }
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
  const gmailConfigured = gmail?.configured === true;
  const gmailConnected = gmail?.connected === true;

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
          <div className="integration"><b className="channel gmail">M</b><span><strong>Gmail</strong><small>{gmailConnected ? (gmail?.account_email ? `Conectado como ${gmail.account_email}` : "Conectado") : gmailConfigured ? "Conecte sua conta Google para enviar." : "Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no backend."}</small></span><Badge tone={gmailConnected ? "green" : gmailConfigured ? "blue" : "red"}>{gmailConnected ? "Conectado" : gmailConfigured ? "Não conectado" : "Não configurado"}</Badge><div className="wa-actions">{gmailConnected ? <Button variant="secondary" onClick={() => void disconnectGmail()}>{gmailDisconnecting ? "Desconectando…" : "Desconectar"}</Button> : gmailConfigured ? <Button variant="secondary" onClick={connectGmail}>Conectar</Button> : null}<Button variant="secondary" onClick={() => setGmailTestMode((value) => !value)}>Teste</Button></div></div>
          {gmailTestMode && <div className="wa-test-row"><input value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="cliente@empresa.com" aria-label="E-mail para envio de teste" /><Button variant="secondary" onClick={() => void sendGmailTest()}>{gmailTestBusy ? "Enviando…" : "Enviar \"oi\""}</Button></div>}
          {gmailTestResult && <p className="settings-message success">{gmailTestResult}</p>}
          {gmailTestError && <p className="settings-message">{gmailTestError}</p>}
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
