"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children, title, eyebrow, action }: { children: ReactNode; title: string; eyebrow?: string; action?: ReactNode }) {
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark">✦</span> proposal<span>ai</span></Link>
      <small className="workspace-label">WORKSPACE</small>
      <nav><Link href="/">▦ <span>Projetos</span></Link><Link href="/projects/demo">◈ <span>Projeto atual</span></Link><Link href="/settings">⚙ <span>Configurações</span></Link></nav>
      <div className="sidebar-bottom"><p className="health"><i /> Todos os sistemas operacionais</p><Link href="/settings" className="demo-user"><b>MR</b><span><strong>Marina Rocha</strong><small>Modo demonstração</small></span>›</Link></div>
    </aside>
    <main className="main"><header className="topbar"><div>{eyebrow && <small className="eyebrow">{eyebrow}</small>}<h1>{title}</h1></div>{action}</header><div className="content">{children}</div></main>
  </div>;
}

export function Button({ children, href, variant = "primary", onClick }: { children: ReactNode; href?: string; variant?: string; onClick?: () => void }) {
  const className = `button ${variant}`;
  return href ? <Link href={href} className={className}>{children}</Link> : <button className={className} onClick={onClick}>{children}</button>;
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
