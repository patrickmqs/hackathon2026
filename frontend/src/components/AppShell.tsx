"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { ViewTransition, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import logoDark from "@/logo/dark-trim.png";
import logoLight from "@/logo/light-trim.png";

export function AppShell({ children, title, eyebrow, action }: { children: ReactNode; title: string; eyebrow?: string; action?: ReactNode }) {
  // Modo escuro é o padrão. O script do layout já aplica o tema salvo (ou escuro)
  // antes do primeiro paint; aqui sincronizamos o estado do toggle.
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("proposal-ai-theme");
    return saved === null ? true : saved === "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("proposal-ai-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // Troca de tema com revelação circular a partir do botão (View Transitions); sem suporte, troca direto.
  function toggleTheme(event: MouseEvent<HTMLButtonElement>) {
    const next = !darkMode;
    const apply = () => {
      document.documentElement.dataset.theme = next ? "dark" : "light";
      flushSync(() => setDarkMode(next));
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduced) { apply(); return; }
    const { clientX: x, clientY: y } = event;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const root = document.documentElement;
    root.classList.add("theme-vt");
    const transition = doc.startViewTransition(apply);
    void transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(.22, 1, .36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
    void transition.finished.finally(() => root.classList.remove("theme-vt"));
  }

  return <div className="app-frame">
    <main className="main"><header className="topbar" style={{ viewTransitionName: "app-header" }}><div className="topbar-heading">
      <Link href="/" className="brand" aria-label="Scope AI">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo brand-logo-light" src={logoLight.src} width={logoLight.width} height={logoLight.height} alt="Scope AI" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo brand-logo-dark" src={logoDark.src} width={logoDark.width} height={logoDark.height} alt="" aria-hidden="true" />
      </Link>
      <div className="topbar-title">{eyebrow && <small className="eyebrow">{eyebrow}</small>}<h1>{title}</h1></div>
    </div><div className="topbar-actions"><Link href="/settings" className="theme-toggle settings-link" aria-label="Conexões (Google e WhatsApp)" title="Conexões (Google e WhatsApp)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg></Link><button className="theme-toggle" type="button" suppressHydrationWarning onClick={toggleTheme} aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"} title={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}>{darkMode ? "☀" : "◐"}</button>{action}</div></header><ViewTransition enter="page-in" exit="page-out" default="none"><div className="content">{children}</div></ViewTransition></main>
  </div>;
}

export function Button({ children, href, variant = "primary", onClick }: { children: ReactNode; href?: string; variant?: string; onClick?: () => void }) {
  const className = `button ${variant}`;
  return href ? <Link href={href} className={className}>{children}</Link> : <button className={className} onClick={onClick}>{children}</button>;
}
export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) { return <section className={`card ${className}`} id={id}>{children}</section>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
