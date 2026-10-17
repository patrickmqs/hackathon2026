"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

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
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="Proposal AI">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" role="img">
            <path d="M7 8.5A5.5 5.5 0 0 1 12.5 3h7A5.5 5.5 0 0 1 25 8.5v5a5.5 5.5 0 0 1-5.5 5.5H14l-5 4v-4.8A5.5 5.5 0 0 1 7 13.5v-5Z" />
            <path d="m12 11.5 3 3 6-6" className="brand-check" />
          </svg>
        </span>
        proposal<span>ai</span>
      </Link>
      <small className="workspace-label">WORKSPACE</small>
      <nav><Link href="/">▦ <span>Projetos</span></Link><Link href="/projects/demo">◈ <span>Projeto atual</span></Link><Link href="/settings">⚙ <span>Configurações</span></Link></nav>
      <div className="sidebar-bottom"><p className="health"><i /> Todos os sistemas operacionais</p><Link href="/settings" className="demo-user"><b>MR</b><span><strong>Marina Rocha</strong><small>Modo demonstração</small></span>›</Link></div>
    </aside>
    <main className="main"><header className="topbar"><div>{eyebrow && <small className="eyebrow">{eyebrow}</small>}<h1>{title}</h1></div><div className="topbar-actions"><button className="theme-toggle" type="button" onClick={() => setDarkMode((current) => !current)} aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}>{darkMode ? "☀" : "◐"} <span>{darkMode ? "Modo claro" : "Modo escuro"}</span></button>{action}</div></header><div className="content">{children}</div></main>
  </div>;
}

export function Button({ children, href, variant = "primary", onClick }: { children: ReactNode; href?: string; variant?: string; onClick?: () => void }) {
  const className = `button ${variant}`;
  return href ? <Link href={href} className={className}>{children}</Link> : <button className={className} onClick={onClick}>{children}</button>;
}
export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) { return <section className={`card ${className}`} id={id}>{children}</section>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
