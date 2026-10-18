"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import logoDark from "@/logo/dark.png";
import logoLight from "@/logo/ligth.png";

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
    </div><div className="topbar-actions"><button className="theme-toggle" type="button" onClick={() => setDarkMode((current) => !current)} aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"} title={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}>{darkMode ? "☀" : "◐"}</button>{action}</div></header><div className="content">{children}</div></main>
  </div>;
}

export function Button({ children, href, variant = "primary", onClick }: { children: ReactNode; href?: string; variant?: string; onClick?: () => void }) {
  const className = `button ${variant}`;
  return href ? <Link href={href} className={className}>{children}</Link> : <button className={className} onClick={onClick}>{children}</button>;
}
export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) { return <section className={`card ${className}`} id={id}>{children}</section>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
