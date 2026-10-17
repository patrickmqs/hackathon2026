"use client";

import { useEffect, useRef, useState } from "react";

// Botão "⋯" com as ações de um projeto da lista (renomear / excluir).
export function ProjectMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return <div className="project-menu" ref={ref}>
    <button type="button" className="project-menu-btn" aria-label="Mais opções" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="3" r="1.6" /><circle cx="9" cy="9" r="1.6" /><circle cx="9" cy="15" r="1.6" /></svg></button>
    {open && <div className="project-menu-pop" role="menu">
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onRename(); }}>Renomear</button>
      <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(); }}>Excluir</button>
    </div>}
  </div>;
}
