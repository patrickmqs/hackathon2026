"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import logoDark from "@/logo/dark-trim.png";
import logoLight from "@/logo/light-trim.png";

export function AppShell({ children, title, eyebrow, action }: { children: ReactNode; title: string; eyebrow?: string; action?: ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setDarkMode(window.localStorage.getItem("proposal-ai-theme") === "dark");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("proposal-ai-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return <div className="app-frame">
    <main className="main"><header className="topbar"><div className="topbar-heading">
      <Link href="/" className="brand" aria-label="Scope AI">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo brand-logo-light" src={logoLight.src} width={logoLight.width} height={logoLight.height} alt="Scope AI" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo brand-logo-dark" src={logoDark.src} width={logoDark.width} height={logoDark.height} alt="" aria-hidden="true" />
      </Link>
      <div className="topbar-title">{eyebrow && <small className="eyebrow">{eyebrow}</small>}<h1>{title}</h1></div>
    </div><div className="topbar-actions"><Link href="/settings" className="theme-toggle settings-link" aria-label="Conexões (Google e WhatsApp)" title="Conexões (Google e WhatsApp)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg></Link><button className="theme-toggle" type="button" onClick={() => setDarkMode((current) => !current)} aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"} title={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}>{darkMode ? "☀" : "◐"}</button>{action}</div></header><div className="content">{children}</div></main>
  </div>;
}

export function Button({ children, href, variant = "primary", onClick }: { children: ReactNode; href?: string; variant?: string; onClick?: () => void }) {
  const className = `button ${variant}`;
  return href ? <Link href={href} className={className}>{children}</Link> : <button className={className} onClick={onClick}>{children}</button>;
}
export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) { return <section className={`card ${className}`} id={id}>{children}</section>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
