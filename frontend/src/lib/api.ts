// Cliente da API do backend (docs/API_SPEC.md). Tipos mínimos: só o que as telas usam.
// URL base: NEXT_PUBLIC_API_URL (padrão http://localhost:8000). O header X-Demo-User vem de
// localStorage["demoUser"] (padrão "Marina") e é exigido em revisão, proposta e aprovação.

import * as demo from "@/lib/demo-mock";
import * as demoProposal from "@/lib/demo-proposal";
import { isDemoId } from "@/lib/demo-mock";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function getDemoUser(): string {
  try {
    return localStorage.getItem("demoUser") || "Marina";
  } catch {
    return "Marina";
  }
}

async function request<T>(method: string, path: string, opts: { body?: unknown; form?: FormData; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.auth) headers["X-Demo-User"] = getDemoUser();
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers, body, cache: "no-store" });
  } catch {
    throw new ApiError(0, "NETWORK", `Não foi possível falar com a API em ${API_URL}. O backend está rodando?`);
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? `Erro ${res.status}`, e?.details);
  }
  return data as T;
}

// ---------- tipos ----------
/** Valores provisórios do backend (schemas/project.ts) enquanto nome e empresa não foram preenchidos. */
export const PLACEHOLDER_PROJECT_NAME = "Projeto sem nome";
export const PLACEHOLDER_COMPANY = "Cliente a definir";
export type ProjectStatus = "no_meeting" | "processing" | "analysis_ready" | "reviewed" | "proposal_draft" | "proposal_approved" | "sent" | "failed";
export interface Project {
  id: string; name: string; description: string | null;
  client: { company?: string; contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null };
  status: ProjectStatus; latest_meeting_id: string | null; latest_proposal_id: string | null;
  created_at: string; updated_at: string;
}
export interface TranscriptSegment { id: string; start_ms: number | null; end_ms: number | null; speaker: string | null; text: string }
export interface Meeting {
  id: string; project_id: string; title: string | null; source_type: "text" | "audio";
  status: "created" | "transcribing" | "analyzing" | "analysis_ready" | "reviewed" | "failed";
  progress: { step: string; message: string; started_at: string };
  transcript: { text: string; segments: TranscriptSegment[]; metadata: Record<string, unknown> } | null;
  error: { code: string; message: string } | null; created_at: string; updated_at: string;
}
export type ReviewStatus = "pending" | "confirmed" | "edited" | "rejected" | "needs_clarification";
export interface SourceRef { quote: string; segment_id?: string | null; speaker?: string | null; start_ms?: number | null; end_ms?: number | null }
interface Reviewable { id: string; confidence: "high" | "medium" | "low"; source_refs: SourceRef[]; review_status: ReviewStatus; reviewer_note?: string | null }
export interface Summary {
  headline: string; executive_summary: string;
  topics: { title: string; summary: string; source_refs: SourceRef[] }[];
  key_decisions: string[]; pending_decisions: string[]; next_steps: string[]; open_points: string[];
  meta: { prompt_version: string; model: string; generated_at: string; basis: "analysis" | "reviewed" };
}
export interface Analysis {
  meeting_id: string; summary: string;
  client_needs: (Reviewable & { description: string; category: string })[];
  requirements: (Reviewable & { title: string; description: string; type: string })[];
  decisions: (Reviewable & { description: string; status: "confirmed" | "pending_validation"; agreed_by: string[] })[];
  commitments: (Reviewable & { owner: string; owner_side: string; description: string; due_text: string | null; status: string })[];
  open_issues: (Reviewable & { type: string; description: string; suggested_question: string | null })[];
  tech_suggestions: (Reviewable & { description: string; category: string; rationale: string })[];
  limitations: string[]; review_completed: boolean; meeting_summary?: Summary | null;
  meta: { model: string; prompt_version: string };
  [k: string]: unknown;
}
export interface ReviewApplied { id: string; kind: string; review_status: "confirmed" | "edited" | "rejected" | "needs_clarification"; title: string; by: "ai" | "human" }
export interface ReviewChatTurn { reply: string; applied: ReviewApplied[]; pending_count: number; analysis: Analysis }
export interface ProposalContent {
  title: string; executive_summary: string; business_context: string; objectives: string[];
  scope: { in_scope: string[]; out_of_scope: string[] };
  modules: { id: string; name: string; description: string; features: string[]; complexity: string }[];
  architecture: { overview: string; components: { name: string; responsibility: string }[]; technologies: unknown[]; is_ai_suggestion: boolean };
  assumptions: string[]; exclusions: string[]; next_steps: string[];
  risks: { description: string; mitigation: string }[]; open_points: { description: string; question: string }[];
  estimates: { total_hours_min: number; total_hours_max: number; confidence: string; basis_label: string; assumptions: string[] };
  total_weeks: number; schedule: { name: string; duration_weeks: number }[];
  commercial: { status: string; disclaimer: string | null };
  client: { company: string }; [k: string]: unknown;
}
export interface Proposal {
  id: string; project_id: string; meeting_id: string; status: string; current_version: number; approved_version: number | null;
  versions: { number: number; status: string; content_hash: string; created_by: string; created_at: string }[];
}
export interface ProposalVersion {
  proposal_id: string; number: number; status: "draft" | "approved" | "superseded"; content: ProposalContent; content_hash: string;
  created_by: string; created_at: string; approval: { id: string; approved_by: string; approved_at: string; note: string | null } | null;
  pdf: { url: string; generated_at: string; size_bytes: number } | null;
}
export interface ProjectEvent { id: string; type: string; actor: string | null; at: string; payload: Record<string, unknown> }
export interface WhatsappStatus {
  configured: boolean; connected: boolean; qr: string | null;
  pairing_code: string | null; phone_number: string | null;
}
export interface WhatsappTestResult { ok: boolean; provider_message_id: string | null; error: string | null }
export interface GmailStatus { configured: boolean; connected: boolean; account_email: string | null; mode: "oauth" }
export interface GmailTestResult { ok: boolean; provider_message_id: string | null; error: string | null }
export interface DeliveryChannel { id: string; channel: string; recipient: { email: string | null; phone: string | null; name: string | null }; status: string; provider_message_id: string | null; error: { code: string; message: string } | null; sent_at: string | null }
export interface Delivery { id: string; approval_id: string; proposal_id: string; proposal_version: number; idempotency_key: string; authorized_by: string; authorized_at: string; status: string; channels: DeliveryChannel[] }

// ---------- chamadas ----------
const real = {
  health: () => request<{ status: string; ai_configured: boolean }>("GET", "/health"),
  listProjects: () => request<{ items: Project[]; total: number }>("GET", "/projects"),
  getProject: (id: string) => request<Project>("GET", `/projects/${id}`),
  createProject: (body: { name?: string; description?: string | null; client?: Project["client"] }) => request<Project>("POST", "/projects", { body }),
  updateProject: (id: string, body: { name?: string; description?: string | null; client?: Project["client"] }) => request<Project>("PATCH", `/projects/${id}`, { body }),
  deleteProject: (id: string) => request<null>("DELETE", `/projects/${id}`),
  projectEvents: (id: string) => request<{ items: ProjectEvent[]; total: number }>("GET", `/projects/${id}/events`),
  createMeetingText: (projectId: string, body: { title?: string; transcript_text: string; language?: string }) =>
    request<Meeting>("POST", `/projects/${projectId}/meetings`, { body }),
  createMeetingAudio: (projectId: string, file: File, title?: string) => {
    const form = new FormData();
    if (title) form.append("title", title);
    form.append("audio", file, file.name);
    return request<Meeting>("POST", `/projects/${projectId}/meetings`, { form });
  },
  getMeeting: (id: string) => request<Meeting>("GET", `/meetings/${id}`),
  reprocess: (id: string) => request<Meeting>("POST", `/meetings/${id}/reprocess`),
  getAnalysis: (meetingId: string) => request<Analysis>("GET", `/meetings/${meetingId}/analysis`),
  reviewChat: (meetingId: string, messages: { role: "user" | "assistant"; content: string }[]) =>
    request<ReviewChatTurn>("POST", `/meetings/${meetingId}/analysis/chat`, { auth: true, body: { messages } }),
  saveAnalysis: (meetingId: string, a: Analysis) => request<Analysis>("PUT", `/meetings/${meetingId}/analysis`, { auth: true, body: a }),
  completeReview: (meetingId: string, acceptPending: boolean) =>
    request<Analysis>("POST", `/meetings/${meetingId}/analysis/complete-review`, { auth: true, body: { accept_pending_as_confirmed: acceptPending } }),
  createProposal: (projectId: string, meetingId: string) =>
    request<Proposal>("POST", `/projects/${projectId}/proposals`, { auth: true, body: { meeting_id: meetingId } }),
  getProposal: (id: string) => request<Proposal>("GET", `/proposals/${id}`),
  getVersion: (id: string, n: number | "latest") => request<ProposalVersion>("GET", `/proposals/${id}/versions/${n}`),
  createVersion: (id: string, content: ProposalContent) => request<ProposalVersion>("POST", `/proposals/${id}/versions`, { auth: true, body: { content } }),
  generatePdf: (id: string, n: number) => request<{ url: string; size_bytes: number }>("POST", `/proposals/${id}/versions/${n}/pdf`),
  approve: (id: string, n: number, contentHash: string, note?: string) =>
    request<unknown>("POST", `/proposals/${id}/versions/${n}/approve`, { auth: true, body: { content_hash: contentHash, note: note ?? null } }),
  pdfUrl: (id: string, n: number, download = false) => `${API_URL}/proposals/${id}/versions/${n}/pdf${download ? "?download=1" : ""}`,
  whatsappStatus: () => request<WhatsappStatus>("GET", "/auth/whatsapp/status"),
  whatsappQr: () => request<{ qr: string | null }>("GET", "/auth/whatsapp/qr"),
  whatsappDisconnect: () => request<{ ok: boolean }>("DELETE", "/auth/whatsapp"),
  whatsappTest: (phone: string, message?: string) => request<WhatsappTestResult>("POST", "/auth/whatsapp/test", { body: { phone, message } }),
  gmailStatus: () => request<GmailStatus>("GET", "/auth/gmail/status"),
  gmailStartUrl: () => `${API_URL}/auth/gmail/start`,
  gmailDisconnect: () => request<{ ok: boolean }>("DELETE", "/auth/gmail"),
  gmailTest: (email: string, extra?: { subject?: string; message?: string }) => request<GmailTestResult>("POST", "/auth/gmail/test", { body: { email, ...extra } }),
  createDelivery: (body: { approval_id: string; idempotency_key: string; channels: { channel: string; recipient: Record<string, unknown>; options?: Record<string, unknown> }[] }) =>
    request<Delivery>("POST", "/deliveries", { auth: true, body }),
  getDelivery: (id: string) => request<Delivery>("GET", `/deliveries/${id}`),
};

// Modo demo (NEXT_PUBLIC_DEMO_MOCK): ids "demo-*" são atendidos por src/lib/demo-mock.ts, sem backend.
export const api: typeof real = {
  ...real,
  getProject: async (id) => (isDemoId(id) ? demo.demoProject() : real.getProject(id)),
  updateProject: async (id, body) => (isDemoId(id) ? demo.updateDemoProject(body) : real.updateProject(id, body)),
  getMeeting: async (id) => (isDemoId(id) ? demo.demoMeeting() : real.getMeeting(id)),
  getAnalysis: async (id) => (isDemoId(id) ? demo.demoAnalysis() : real.getAnalysis(id)),
  saveAnalysis: async (id, a) => (isDemoId(id) ? demo.saveDemoAnalysis(a) : real.saveAnalysis(id, a)),
  completeReview: async (id, accept) => (isDemoId(id) ? demo.completeDemoReview(accept) : real.completeReview(id, accept)),
  createProposal: async (projectId, meetingId) => (isDemoId(meetingId) ? demoProposal.createDemoProposal() : real.createProposal(projectId, meetingId)),
  getProposal: async (id) => (isDemoId(id) ? demoProposal.demoProposal() : real.getProposal(id)),
  getVersion: async (id, n) => (isDemoId(id) ? demoProposal.demoVersion() : real.getVersion(id, n)),
  approve: async (id, n, hash, note) => (isDemoId(id) ? demoProposal.approveDemoProposal(note) : real.approve(id, n, hash, note)),
  pdfUrl: (id, n, download) => (isDemoId(id) ? demoProposal.demoProposalUrl() : real.pdfUrl(id, n, download)),
  createDelivery: async (body) => (body.approval_id.startsWith("demo-") ? demoProposal.createDemoDelivery(body.channels) : real.createDelivery(body)),
  reviewChat: async (id, messages) => {
    if (!isDemoId(id)) return real.reviewChat(id, messages);
    const analysis = demo.demoAnalysis();
    return { reply: "Modo demonstração: o chat de revisão não está ativo. Use os botões de cada item para confirmar, editar ou rejeitar.", applied: [], pending_count: 0, analysis };
  },
};

// ---------- apresentação ----------
export const STATUS_LABEL: Record<ProjectStatus, { label: string; tone: string; progress: number; step: number }> = {
  no_meeting: { label: "Sem reunião", tone: "neutral", progress: 0, step: 0 },
  processing: { label: "Processando", tone: "purple", progress: 20, step: 0 },
  analysis_ready: { label: "Análise pronta", tone: "blue", progress: 40, step: 1 },
  reviewed: { label: "Análise revisada", tone: "blue", progress: 55, step: 2 },
  proposal_draft: { label: "Proposta em rascunho", tone: "amber", progress: 70, step: 3 },
  proposal_approved: { label: "Proposta aprovada", tone: "green", progress: 100, step: 4 },
  sent: { label: "Enviada", tone: "green", progress: 100, step: 5 },
  failed: { label: "Falhou", tone: "red", progress: 0, step: 0 },
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}
