import type { NextFunction, Request, Response } from "express";

// CORS mínimo, sem dependência externa. Reflete a origem apenas se estiver na
// allowlist configurada; responde preflight OPTIONS com 204.
export function corsMiddleware(origins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Demo-User, X-Idempotency-Key, X-Request-Id",
    );
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
