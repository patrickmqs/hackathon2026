// Parte de proposta do modo demo (ver demo-mock.ts): rascunho mockado, aprovação, envio e o
// documento exibido no lugar do PDF. Estado só em memória.
import type { Delivery, Proposal, ProposalContent, ProposalVersion } from "@/lib/api";

export const DEMO_PROPOSAL_ID = "demo-proposal";
const PROJECT_ID = "demo-project";
const MEETING_ID = "demo-meeting";
const HASH = "demo-hash";

// A proposta já nasce pronta: o projeto a expõe assim que a análise fica pronta (sem etapa de geração).
let createdAt = new Date().toISOString();
let approval: ProposalVersion["approval"] = null;

export const isProposalApproved = () => approval !== null;

export function resetDemoProposal() {
  approval = null;
  createdAt = new Date().toISOString();
}

const CONTENT: ProposalContent = {
  title: "Plataforma de agendamento online com confirmação por WhatsApp",
  executive_summary:
    "Proposta para a Clínica Sorriso Vivo substituir a agenda em planilha por um agendamento online com lembretes automáticos por WhatsApp, reduzindo as faltas (hoje em torno de 20%) e a carga de ligações da recepção.",
  business_context:
    "A clínica tem 6 dentistas, 3 cadeiras por turno e cerca de 80 atendimentos por dia. A agenda é controlada em planilha e caderno, e o prontuário é em papel. A recepção confirma consultas por telefone e pelo WhatsApp do celular da clínica.",
  objectives: [
    "Reduzir o índice de faltas com confirmação automática 1 dia e 2 horas antes da consulta",
    "Permitir que o paciente agende sozinho, escolhendo dentista e horário",
    "Liberar a recepção das ligações de confirmação",
  ],
  scope: {
    in_scope: [
      "Agendamento online por link, com escolha de dentista, procedimento e horário",
      "Duração por tipo de procedimento (limpeza 40 min, consulta 30 min, canal e implante 2 h)",
      "Registro do convênio do paciente (3 convênios)",
      "Remarcação autônoma pelo paciente dentro do prazo definido",
      "Lembretes e confirmação por WhatsApp (API oficial)",
      "Painel de agenda para a recepção",
    ],
    out_of_scope: ["Prontuário digital (fase 2)", "Cobrança no ato do agendamento", "Substituição do sistema de cobrança atual"],
  },
  modules: [
    { id: "m1", name: "Agendamento online", description: "Link público para o paciente escolher dentista, procedimento e horário.", features: ["Disponibilidade por dentista e cadeira", "Bloqueio de horário conforme a duração do procedimento", "Seleção de convênio"], complexity: "M" },
    { id: "m2", name: "Lembretes por WhatsApp", description: "Disparo automático de mensagens de confirmação e lembrete.", features: ["Lembrete 1 dia antes", "Lembrete 2 horas antes", "Confirmar, remarcar ou cancelar pela resposta"], complexity: "L" },
    { id: "m3", name: "Painel da recepção", description: "Agenda unificada para a equipe da clínica.", features: ["Visão por dentista e por dia", "Encaixes de última hora", "Status de confirmação de cada paciente"], complexity: "M" },
  ],
  architecture: {
    overview: "Aplicação web com API própria e fila de envio de mensagens, integrada ao WhatsApp Business (API oficial da Meta).",
    components: [
      { name: "Front-end web", responsibility: "Agendamento do paciente e painel da recepção" },
      { name: "API de agenda", responsibility: "Regras de disponibilidade, duração e remarcação" },
      { name: "Serviço de mensagens", responsibility: "Fila e disparo dos lembretes via WhatsApp" },
    ],
    technologies: [],
    is_ai_suggestion: true,
  },
  assumptions: ["A clínica contratará a API oficial do WhatsApp (cadastro na Meta e custo por conversa)", "Prazo de remarcação será definido pela clínica (24 h ou 12 h)"],
  exclusions: ["Custos mensais da API oficial do WhatsApp", "Migração do histórico de agenda em papel"],
  next_steps: ["Clínica valida o custo da API oficial com o Dr. Paulo", "Marcos confirma se o sistema de cobrança tem API", "Reunião de alinhamento com o sócio na próxima semana"],
  risks: [
    { description: "Sem a API oficial do WhatsApp, o lembrete automático não fica estável", mitigation: "Decidir sobre a API antes do início do desenvolvimento" },
    { description: "Sistema de cobrança pode não ter API", mitigation: "Integrar por importação de planilha, se necessário" },
  ],
  open_points: [
    { description: "Prazo de remarcação autônoma", question: "24 horas ou 12 horas antes da consulta?" },
    { description: "Integração com o sistema de cobrança", question: "O fornecedor oferece API ou apenas exportação de planilha?" },
  ],
  estimates: { total_hours_min: 360, total_hours_max: 520, confidence: "medium", basis_label: "Estimativa preliminar com base na reunião", assumptions: ["Escopo da fase 1, sem prontuário", "API oficial do WhatsApp aprovada"] },
  total_weeks: 8,
  schedule: [
    { name: "Descoberta e desenho", duration_weeks: 1 },
    { name: "Agendamento online e painel", duration_weeks: 4 },
    { name: "Lembretes por WhatsApp", duration_weeks: 2 },
    { name: "Homologação e entrada em produção", duration_weeks: 1 },
  ],
  commercial: { status: "pending", disclaimer: "Valores a definir após a decisão sobre a API oficial do WhatsApp." },
  client: { company: "Clínica Sorriso Vivo" },
};

export async function createDemoProposal(): Promise<Proposal> {
  return demoProposal();
}

export function demoProposal(): Proposal {
  return {
    id: DEMO_PROPOSAL_ID, project_id: PROJECT_ID, meeting_id: MEETING_ID,
    status: approval ? "approved" : "draft", current_version: 1, approved_version: approval ? 1 : null,
    versions: [{ number: 1, status: approval ? "approved" : "draft", content_hash: HASH, created_by: "IA", created_at: createdAt }],
  };
}

export function demoVersion(): ProposalVersion {
  return {
    proposal_id: DEMO_PROPOSAL_ID, number: 1, status: approval ? "approved" : "draft", content: CONTENT, content_hash: HASH,
    created_by: "IA", created_at: createdAt, approval, pdf: null,
  };
}

export function approveDemoProposal(note?: string) {
  approval = { id: "demo-approval", approved_by: "Marina", approved_at: new Date().toISOString(), note: note ?? null };
  return { ok: true };
}

export function createDemoDelivery(channels: { channel: string; recipient: Record<string, unknown> }[]): Delivery {
  const now = new Date().toISOString();
  return {
    id: "demo-delivery", approval_id: "demo-approval", proposal_id: DEMO_PROPOSAL_ID, proposal_version: 1,
    idempotency_key: "demo", authorized_by: "Marina", authorized_at: now, status: "sent",
    channels: channels.map((c, i) => ({
      id: `demo-channel-${i}`, channel: c.channel,
      recipient: { email: (c.recipient.email as string) ?? null, phone: (c.recipient.phone as string) ?? null, name: (c.recipient.name as string) ?? null },
      status: "sent", provider_message_id: null, error: null, sent_at: now,
    })),
  };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

/** Documento da proposta exibido no lugar do PDF (data URL para o iframe). */
export function demoProposalUrl(): string {
  const c = CONTENT;
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>
body{font:15px/1.6 system-ui,sans-serif;color:#1c1f2a;max-width:820px;margin:0 auto;padding:40px 32px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px;color:#4b3fd1;border-bottom:1px solid #e5e5f0;padding-bottom:4px}
h3{font-size:15px;margin:16px 0 2px}.muted{color:#6b7080}table{border-collapse:collapse;width:100%}td,th{border:1px solid #e5e5f0;padding:8px;text-align:left}
.tag{display:inline-block;background:#eeecff;color:#4b3fd1;border-radius:6px;padding:0 8px;font-size:12px;margin-left:8px}</style><body>
<p class="muted">Proposta comercial · ${esc(c.client.company)}</p><h1>${esc(c.title)}</h1>
<h2>Resumo executivo</h2><p>${esc(c.executive_summary)}</p>
<h2>Contexto</h2><p>${esc(c.business_context)}</p>
<h2>Objetivos</h2>${list(c.objectives)}
<h2>Escopo</h2><h3>Incluído</h3>${list(c.scope.in_scope)}<h3>Fora do escopo</h3>${list(c.scope.out_of_scope)}
<h2>Módulos</h2>${c.modules.map((m) => `<h3>${esc(m.name)}<span class="tag">complexidade ${esc(m.complexity)}</span></h3><p>${esc(m.description)}</p>${list(m.features)}`).join("")}
<h2>Arquitetura</h2><p>${esc(c.architecture.overview)}</p>${list(c.architecture.components.map((x) => `${x.name}: ${x.responsibility}`))}
<h2>Estimativa e cronograma</h2><p>${c.estimates.total_hours_min}–${c.estimates.total_hours_max} horas · ${c.total_weeks} semanas <span class="muted">(${esc(c.estimates.basis_label)})</span></p>
<table><tr><th>Etapa</th><th>Duração</th></tr>${c.schedule.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.duration_weeks} sem.</td></tr>`).join("")}</table>
<h2>Premissas</h2>${list(c.assumptions)}<h2>Exclusões</h2>${list(c.exclusions)}
<h2>Riscos</h2>${list(c.risks.map((r) => `${r.description}. Mitigação: ${r.mitigation}`))}
<h2>Pontos em aberto</h2>${list(c.open_points.map((o) => `${o.description}: ${o.question}`))}
<h2>Próximos passos</h2>${list(c.next_steps)}
<h2>Investimento</h2><p>${esc(c.commercial.disclaimer ?? "A definir.")}</p></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
