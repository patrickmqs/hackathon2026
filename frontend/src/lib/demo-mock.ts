// Modo demo (padrão): importar uma reunião não chama a IA. A tela de
// processamento roda ~15s "de verdade" e termina numa análise pronta (Clínica Sorriso Vivo).
// Estado só em memória: recarregar a página reinicia a demo.
import { isProposalApproved, resetDemoProposal, DEMO_PROPOSAL_ID } from "@/lib/demo-proposal";
import type { Analysis, Meeting, Project, Summary } from "@/lib/api";

// Ligado por padrão (o deploy não precisa de variável); NEXT_PUBLIC_DEMO_MOCK=false volta ao fluxo real.
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MOCK !== "false";
export const DEMO_DELAY_MS = 15_000;
// Destinatário pré-preenchido no envio da proposta (só no modo demo, quando o projeto não tem contato).
export const DEMO_CONTACT = { email: "patrickmquintino@gmail.com", phone: "+5521999042005" };
export const DEMO_PROJECT_ID = "demo-project";
export const DEMO_MEETING_ID = "demo-meeting";

export const isDemoId = (id: string) => DEMO_ENABLED && id.startsWith("demo-");

const TRANSCRIPT = [
  "Helena: Hoje a nossa agenda é toda em planilha e no caderno da recepção. A gente perde muita consulta por falta, uns vinte por cento dos pacientes não aparecem, e a recepção passa o dia ligando pra confirmar.",
  "Marcos: E o prontuário é em papel. Quando o paciente volta depois de seis meses, a gente demora pra achar a ficha.",
  "Helena: Isso. Mas o agendamento é a prioridade. O prontuário pode vir numa segunda fase.",
  "Marcos: São seis dentistas, três cadeiras por turno, e a gente faz em média oitenta atendimentos por dia.",
  "Helena: O sonho é o paciente marcar sozinho, pelo WhatsApp ou por um link, escolhendo o dentista e o horário.",
  "Helena: Pode, isso está decidido. O lembrete por WhatsApp é essencial.",
  "Marina: A API oficial exige cadastro na Meta e tem custo por conversa. Isso muda o orçamento, então precisamos validar com vocês se aceitam.",
  "Helena: Isso eu preciso conversar com o meu sócio, o doutor Paulo. Não sei se ele vai topar o custo mensal.",
  "Marcos: Temos um sistema de cobrança antigo, que emite os boletos. Queremos manter, não vamos trocar agora.",
  "Marcos: Eu pergunto hoje e te respondo até sexta-feira.",
  "Helena: Pode remarcar até vinte e quatro horas antes. Depois disso precisa falar com a recepção.",
  "Marcos: Na verdade eu acho que devia ser doze horas, porque tem paciente que avisa de manhã e a gente consegue encaixar outro.",
  "Helena: Limpeza quarenta minutos, consulta trinta, canal e implante duas horas.",
  "Helena: Queria começar a usar em dois meses, antes do início do semestre, quando a clínica enche.",
  "Helena: Posso tentar marcar para a semana que vem. Eu te passo as datas até terça.",
];

const ref = (line: number) => ({ quote: TRANSCRIPT[line].split(": ").slice(1).join(": "), speaker: TRANSCRIPT[line].split(":")[0] });
const base = { review_status: "pending" as const, source_refs: [] };

const SUMMARY: Summary = {
  headline: "Clínica Sorriso Vivo quer agendamento online com confirmação automática por WhatsApp",
  executive_summary:
    "A clínica perde cerca de 20% das consultas por falta de pacientes e controla a agenda em planilha e caderno. A prioridade é um agendamento online (link ou WhatsApp) com lembretes 1 dia e 2 horas antes; o prontuário digital fica para uma segunda fase. A viabilidade do prazo de 2 meses depende da decisão sobre a API oficial do WhatsApp.",
  topics: [
    { title: "Agendamento online e lembretes", summary: "Paciente escolhe dentista e horário por link ou WhatsApp; confirmação automática 1 dia e 2 horas antes.", source_refs: [ref(4), ref(5)] },
    { title: "Regras de agenda", summary: "Duração por procedimento, convênio apenas informativo e remarcação autônoma até um limite de horas (24h ou 12h, em aberto).", source_refs: [ref(10), ref(12)] },
    { title: "Integrações", summary: "Sistema de cobrança atual será mantido; integração depende de o fornecedor ter API. WhatsApp exige API oficial da Meta.", source_refs: [ref(6), ref(8)] },
  ],
  key_decisions: ["Agendamento online com lembretes por WhatsApp (1 dia e 2 h antes)", "Prontuário digital fica para a fase 2", "Sistema de cobrança atual será mantido"],
  pending_decisions: ["Aceitar o custo da API oficial do WhatsApp (depende do Dr. Paulo)", "Prazo de remarcação: 24 h ou 12 h"],
  next_steps: ["Software House envia a proposta", "Helena conversa com o Dr. Paulo e passa datas até terça", "Marcos confirma a API do sistema de cobrança até sexta"],
  open_points: ["Sistema de cobrança tem API ou só exporta planilha?", "Quantos convênios e quais?"],
  meta: { prompt_version: "demo", model: "demo", generated_at: new Date().toISOString(), basis: "analysis" },
};

function buildAnalysis(): Analysis {
  return {
    meeting_id: DEMO_MEETING_ID,
    summary: SUMMARY.executive_summary,
    participants: [
      { name: "Helena", role: "Proprietária", side: "client" },
      { name: "Marcos", role: "Administrador", side: "client" },
      { name: "Rafael", role: "Gerente de contas", side: "vendor" },
      { name: "Marina", role: "Tech lead", side: "vendor" },
    ],
    client_needs: [
      { ...base, id: "n1", confidence: "high", category: "problem", description: "Cerca de 20% dos pacientes faltam e a recepção passa o dia ligando para confirmar.", source_refs: [ref(0)] },
      { ...base, id: "n2", confidence: "high", category: "problem", description: "Prontuário em papel: demora para localizar fichas de pacientes que retornam.", source_refs: [ref(1)] },
      { ...base, id: "n3", confidence: "high", category: "business_goal", description: "Paciente agendar sozinho, escolhendo dentista e horário.", source_refs: [ref(4)] },
    ],
    requirements: [
      { ...base, id: "r1", confidence: "high", title: "Agendamento online por link/WhatsApp", description: "Paciente escolhe dentista e horário disponível sem falar com a recepção.", type: "functional", source_refs: [ref(4)] },
      { ...base, id: "r2", confidence: "high", title: "Lembretes automáticos por WhatsApp", description: "Mensagens 1 dia e 2 horas antes da consulta, com confirmação.", type: "functional", source_refs: [ref(5)] },
      { ...base, id: "r3", confidence: "high", title: "Duração por tipo de procedimento", description: "Limpeza 40 min, consulta 30 min, canal e implante 2 h; bloqueia o horário correspondente.", type: "functional", source_refs: [ref(12)] },
      { ...base, id: "r4", confidence: "medium", title: "Registro do convênio do paciente", description: "O sistema só registra qual dos 3 convênios o paciente usa; não cobra no agendamento.", type: "functional", source_refs: [] },
      { ...base, id: "r5", confidence: "medium", title: "Remarcação pelo paciente", description: "Remarcação autônoma até um limite de horas antes da consulta (24 h ou 12 h, em aberto).", type: "functional", source_refs: [ref(10)] },
    ],
    decisions: [
      { ...base, id: "d1", confidence: "high", description: "Agendamento online com lembretes por WhatsApp é o escopo da fase 1.", status: "confirmed", agreed_by: ["Helena", "Rafael"], source_refs: [ref(5)] },
      { ...base, id: "d2", confidence: "high", description: "Prontuário digital fica para a fase 2.", status: "confirmed", agreed_by: ["Helena"], source_refs: [ref(2)] },
      { ...base, id: "d3", confidence: "medium", description: "Manter o sistema de cobrança atual (boletos).", status: "confirmed", agreed_by: ["Marcos"], source_refs: [ref(8)] },
      { ...base, id: "d4", confidence: "medium", description: "Usar a API oficial do WhatsApp (Meta), com custo por conversa.", status: "pending_validation", agreed_by: [], source_refs: [ref(6), ref(7)] },
    ],
    commitments: [
      { ...base, id: "c1", confidence: "high", owner: "Marcos", owner_side: "client", description: "Confirmar com o fornecedor se o sistema de cobrança tem API.", due_text: "até sexta-feira", status: "confirmed", source_refs: [ref(9)] },
      { ...base, id: "c2", confidence: "high", owner: "Helena", owner_side: "client", description: "Conversar com o Dr. Paulo sobre o custo da API oficial e passar datas para nova reunião.", due_text: "até terça", status: "confirmed", source_refs: [ref(7), ref(14)] },
      { ...base, id: "c3", confidence: "high", owner: "Rafael", owner_side: "vendor", description: "Enviar a proposta com agendamento online e lembretes.", due_text: null, status: "confirmed", source_refs: [] },
    ],
    open_issues: [
      { ...base, id: "o1", confidence: "high", type: "contradiction", description: "Divergência sobre o prazo de remarcação: 24 h (Helena) ou 12 h (Marcos).", suggested_question: "Qual será o prazo mínimo de remarcação autônoma?", source_refs: [ref(10), ref(11)] },
      { ...base, id: "o2", confidence: "high", type: "risk", description: "Sem a API oficial do WhatsApp, o lembrete automático não fica estável, e o prazo de 2 meses fica em risco.", suggested_question: "O Dr. Paulo aprova o custo mensal da API oficial?", source_refs: [ref(6), ref(13)] },
      { ...base, id: "o3", confidence: "medium", type: "missing_info", description: "Não se sabe se o sistema de cobrança expõe API ou apenas exporta planilha.", suggested_question: "O fornecedor oferece API ou integração por arquivo?", source_refs: [ref(8)] },
    ],
    tech_suggestions: [
      { ...base, id: "t1", confidence: "medium", category: "integration", description: "Integrar o sistema de cobrança por importação de planilha caso não haja API.", rationale: "O sistema atual exporta planilha." },
    ],
    limitations: [],
    review_completed: false,
    meeting_summary: SUMMARY,
    meta: { model: "demo", prompt_version: "demo" },
  };
}

let startedAt: number | null = null;
let analysis: Analysis | null = null;
let projectName = "Agendamento online · Clínica Sorriso Vivo";
let company = "Clínica Sorriso Vivo";

/** Chamado ao importar a reunião: reinicia a demo e começa a contar os 15s. */
export function startDemoMeeting(): Meeting {
  startedAt = Date.now();
  analysis = null;
  resetDemoProposal();
  return demoMeeting();
}

export function demoMeeting(): Meeting {
  const elapsed = startedAt === null ? DEMO_DELAY_MS : Date.now() - startedAt;
  const iso = new Date(startedAt ?? Date.now()).toISOString();
  const ready = elapsed >= DEMO_DELAY_MS;
  const phase = ready ? "analysis_ready" : elapsed < 2_000 ? "created" : "analyzing";
  const message = ready ? "Análise concluída."
    : elapsed < 2_000 ? "Reunião recebida."
    : elapsed < 6_000 ? "Lendo a transcrição…"
    : elapsed < 10_000 ? "Extraindo requisitos, decisões e pendências…"
    : "Escrevendo o resumo executivo…";
  return {
    id: DEMO_MEETING_ID, project_id: DEMO_PROJECT_ID, title: "Reunião de descoberta · Clínica Sorriso Vivo", source_type: "text",
    status: phase, progress: { step: phase, message, started_at: iso },
    transcript: { text: TRANSCRIPT.join("\n"), segments: [], metadata: { language: "pt-BR" } },
    error: null, created_at: iso, updated_at: iso,
  };
}

export function demoProject(): Project {
  const iso = new Date(startedAt ?? Date.now()).toISOString();
  const ready = demoMeeting().status === "analysis_ready";
  return {
    id: DEMO_PROJECT_ID, name: projectName, description: null,
    client: { company, contact_name: "Helena", contact_email: null, contact_phone: null },
    status: !ready ? "processing" : isProposalApproved() ? "proposal_approved" : analysis?.review_completed ? "reviewed" : "analysis_ready",
    latest_meeting_id: DEMO_MEETING_ID, latest_proposal_id: ready ? DEMO_PROPOSAL_ID : null, created_at: iso, updated_at: new Date().toISOString(),
  };
}

export function updateDemoProject(body: { name?: string; client?: Project["client"] }): Project {
  if (body.name) projectName = body.name;
  if (body.client?.company) company = body.client.company;
  return demoProject();
}

export function demoAnalysis(): Analysis {
  return (analysis ??= buildAnalysis());
}

export function saveDemoAnalysis(next: Analysis): Analysis {
  return (analysis = next);
}

export function completeDemoReview(acceptPending: boolean): Analysis {
  const current = demoAnalysis();
  const settle = <T extends { review_status: string }>(items: T[]): T[] =>
    items.map((i) => (i.review_status === "pending" && acceptPending ? { ...i, review_status: "confirmed" } : i));
  return (analysis = {
    ...current,
    client_needs: settle(current.client_needs), requirements: settle(current.requirements), decisions: settle(current.decisions),
    commitments: settle(current.commitments), open_issues: settle(current.open_issues), tech_suggestions: settle(current.tech_suggestions),
    review_completed: true,
  });
}
