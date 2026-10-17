import type { NextFunction, Request, Response } from "express";
import { DomainError } from "../core/errors.js";

// Exige o header `X-Demo-User` (identidade em modo demo — API_SPEC §2/§4.4).
// Em produção será substituído por autenticação real; por ora o MVP sempre exige.
export function requireDemoUser(req: Request, res: Response, next: NextFunction): void {
  const value = req.headers["x-demo-user"];
  const user = Array.isArray(value) ? value[0] : value;
  if (!user || user.trim() === "") {
    next(new DomainError("DEMO_USER_REQUIRED", "Header X-Demo-User é obrigatório."));
    return;
  }
  res.locals.demoUser = user;
  next();
}
