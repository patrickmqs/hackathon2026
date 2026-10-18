"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Analysis, type ReviewApplied } from "@/lib/api";
import { errorMessage } from "@/components/Api";

type Msg = { role: "user" | "assistant"; content: string; applied?: ReviewApplied[] };

const STATUS_LABEL: Record<ReviewApplied["review_status"], string> = {
  confirmed: "Confirmado",
  edited: "Corrigido",
  rejected: "Descartado",
  needs_clarification: "A esclarecer",
};

const QUICK = ["Sim, está correto", "Não, descartar", "Não sei, vou perguntar ao cliente"];

// Revisão por conversa: o assistente pergunta, a resposta do humano vira a marcação dos itens.
export function ReviewChat({ meetingId, pending, locked, onAnalysis, onClose, onGenerate, generating }: {
  meetingId: string;
  pending: number;
  locked: boolean;
  onAnalysis: (analysis: Analysis) => void;
  onClose?: () => void;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const storageKey = `review-chat:${meetingId}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  // Restaura a conversa da sessão; sem histórico, o assistente abre a revisão (uma chamada barata).
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    let saved: Msg[] = [];
    try { saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]"); } catch { /* sem sessão */ }
    setMessages(saved);
    setReady(true);
    if (!saved.length && !locked && pending > 0) void turn([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(messages)); } catch { /* sem sessão */ }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, ready, storageKey]);

  async function turn(history: Msg[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.reviewChat(meetingId, history.map(({ role, content }) => ({ role, content })));
      setMessages([...history, { role: "assistant", content: res.reply, applied: res.applied }]);
      if (res.applied.length) onAnalysis(res.analysis);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || busy || locked) return;
    setInput("");
    void turn([...messages, { role: "user", content }]);
  }

  const done = !locked && pending === 0;

  return (
    <section className="chat card" aria-label="Assistente de revisão">
      <header className="chat-head">
        <span className="chat-avatar" aria-hidden="true">✦</span>
        <div>
          <strong>Assistente de revisão</strong>
          <small>{locked ? "Revisão concluída" : done ? "Tudo confirmado" : `${pending} ${pending === 1 ? "ponto" : "pontos"} para confirmar`}</small>
        </div>
        {onClose && <button type="button" className="chat-close" onClick={onClose} aria-label="Recolher assistente" title="Recolher">×</button>}
      </header>

      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <p>{m.content}</p>
            {m.applied && m.applied.length > 0 && (
              <ul className="chat-applied">
                {m.applied.map((a) => (
                  <li key={a.id} className={a.review_status}><b>{a.by === "ai" ? "IA · " : ""}{STATUS_LABEL[a.review_status]}</b> {a.title}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {busy && <div className="chat-msg assistant typing" aria-label="Investigando"><i /><i /><i /><span>Investigando a reunião…</span></div>}
        {!messages.length && !busy && !error && <p className="chat-empty">{locked ? "Esta revisão já foi concluída." : "Iniciando a revisão…"}</p>}
        {done && !busy && <div className="chat-done">
          <p>✓ Revisão completa. Você já pode gerar a proposta.</p>
          {onGenerate && <button type="button" className="button" disabled={generating} onClick={onGenerate}>{generating ? "Gerando…" : "Gerar proposta →"}</button>}
        </div>}
        {error && (
          <p className="chat-error" role="alert">
            ⚠ {error}{" "}
            <button type="button" onClick={() => void turn(messages)}>Tentar de novo</button>
          </p>
        )}
      </div>

      {!locked && !done && (
        <>
          <div className="chat-quick">
            {QUICK.map((q) => <button key={q} type="button" disabled={busy || !messages.length} onClick={() => send(q)}>{q}</button>)}
          </div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <textarea
              value={input}
              rows={1}
              placeholder="Responda ao assistente…"
              aria-label="Sua resposta"
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            />
            <button type="submit" className="chat-send" disabled={busy || !input.trim()} aria-label="Enviar">➤</button>
          </form>
        </>
      )}
    </section>
  );
}
