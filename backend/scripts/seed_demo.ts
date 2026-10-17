// Seed de demonstração — B13. Popula projeto → reunião → análise revisada → proposta.
// Rode com: `npx tsx scripts/seed_demo.ts`
// Usa `createRepository()`: com DEMO_MODE=true (padrão) usa memória (efêmero); com
// DEMO_MODE=false e DATABASE_URL configurado, persiste via Prisma.

import { createRepository } from "../src/core/container.js";
import { MeetingAnalysisSchema } from "../src/schemas/analysis.js";
import { buildProposalContent } from "../src/services/proposal/builder.js";
import { contentHash } from "../src/services/proposal/versioning.js";

async function main(): Promise<void> {
  const repo = createRepository();

  const project = await repo.createProject({
    name: "Portal de Pedidos B2B",
    description: "Plataforma de pedidos para distribuidores",
    client: {
      company: "Distribuidora Horizonte (demo)",
      contact_name: "Ana Souza",
      contact_email: "ana@example.com",
    },
  });

  const meeting = await repo.createMeeting({
    projectId: project.id,
    sourceType: "text",
    status: "reviewed",
    title: "Reunião de descoberta",
    audioPath: null,
  });
  await repo.createTranscript({
    meetingId: meeting.id,
    text: "Ana: hoje os pedidos chegam por WhatsApp e planilha; queremos um portal com login, catálogo e integração com ERP.",
    segments: [],
    metadata: { language: "pt-BR", source_type: "text" },
  });

  const analysis = MeetingAnalysisSchema.parse({
    meeting_id: meeting.id,
    summary:
      "Cliente quer substituir o fluxo manual de pedidos (WhatsApp/planilha) por um portal B2B com catálogo, carrinho e integração com o ERP.",
    participants: [{ name: "Ana Souza", role: "Diretora", side: "client" }],
    client_needs: [
      { id: "n1", confidence: "high", category: "problem", description: "Pedidos chegam por WhatsApp e planilha, causando retrabalho." },
      { id: "n2", confidence: "high", category: "business_goal", description: "Digitalizar o recebimento de pedidos." },
    ],
    requirements: [
      { id: "r1", confidence: "high", title: "Login de distribuidores", description: "Autenticação por e-mail/senha", type: "functional", module_id: "m1" },
      { id: "r2", confidence: "high", title: "Catálogo de produtos", description: "Listagem e busca de produtos", type: "functional", module_id: "m1" },
      { id: "r3", confidence: "medium", title: "Integração com ERP", description: "Sincronizar pedidos com o ERP", type: "integration", module_id: "m2" },
    ],
    modules: [
      { id: "m1", name: "Portal e catálogo", description: "Área logada com catálogo e carrinho", requirement_ids: ["r1", "r2"], complexity: "M" },
      { id: "m2", name: "Integração ERP", description: "Sincronização bidirecional de pedidos", requirement_ids: ["r3"], complexity: "L" },
    ],
    decisions: [{ id: "d1", confidence: "high", description: "Integração via API REST do ERP", status: "confirmed" }],
    commitments: [
      { id: "c1", confidence: "high", owner: "Ana", owner_side: "client", description: "Fornecer credenciais do ERP", status: "confirmed" },
    ],
    open_issues: [
      { id: "o1", confidence: "medium", type: "risk", description: "API do ERP pode ter limites de taxa", impact: ["architecture"] },
    ],
    tech_suggestions: [
      { id: "t1", confidence: "medium", category: "technology", description: "Next.js + PostgreSQL", rationale: "Stack já adotada no time" },
    ],
    transcript_metadata: { language: "pt-BR", duration_ms: null, has_speakers: false, has_timestamps: false, source_type: "text" },
    limitations: [],
    review_completed: true,
    meta: { schema_version: "1.0", prompt_version: "seed-v1", model: "seed", generated_at: new Date().toISOString() },
  });

  await repo.createAnalysis({ meetingId: meeting.id, content: analysis, promptVersion: analysis.meta.prompt_version });
  const analysisRecord = await repo.getAnalysis(meeting.id);
  await repo.updateAnalysis(analysisRecord!.id, {
    reviewCompleted: true,
    reviewedBy: "Marina",
    reviewedAt: new Date().toISOString(),
  });

  const content = buildProposalContent({ project, meeting, analysis });
  const proposal = await repo.createProposal({ projectId: project.id, meetingId: meeting.id });
  await repo.createVersion({
    proposalId: proposal.id,
    number: 1,
    content,
    contentHash: contentHash(content),
    createdBy: "Marina",
  });
  await repo.updateProposal(proposal.id, { currentVersion: 1 });

  console.log("Seed concluído:");
  console.log(JSON.stringify({ project_id: project.id, meeting_id: meeting.id, proposal_id: proposal.id }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
