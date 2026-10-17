"use client";

import "./integration.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Erro inesperado.";
}

/** Carrega dados da API ao montar e quando `deps` mudam. `reload()` busca de novo sem piscar a tela. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; done: boolean }>({ data: null, error: null, done: false });
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const reload = useCallback(async () => {
    try {
      const data = await fnRef.current();
      setState({ data, error: null, done: true });
    } catch (e) {
      setState((s) => ({ ...s, error: errorMessage(e), done: true }));
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data: state.data, error: state.error, loading: !state.done, reload };
}

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return <p className="api-error" role="alert">⚠ {message}{onRetry && <button onClick={onRetry}>Tentar de novo</button>}</p>;
}

export function Loading({ text = "Carregando…" }: { text?: string }) {
  return <p className="api-loading">{text}</p>;
}
