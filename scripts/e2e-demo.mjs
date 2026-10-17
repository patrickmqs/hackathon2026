// IA14 — percorre a API na ordem da demo e imprime o que importa para avaliar a IA.
// Uso (servidor já rodando):   node scripts/e2e-demo.mjs [--audio] [--pdf] [--approve] [--base http://localhost:8000]
//   (padrão: transcrição de sample_data/sample_transcript_pt.txt; --audio envia sample_data/sample_meeting.mp3)
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = opt("--base", "http://localhost:8000");
const USER = "Marina";
const root = path.resolve(import.meta.dirname, "..");
const t0 = Date.now();
const tick = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

async function api(method, url, { body, form, auth } = {}) {
  const headers = {};
  if (auth) headers["X-Demo-User"] = USER;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(data?.error ?? data).slice(0, 300)}`);
  return data;
}
const h = (t) => console.log(`\n=== ${t} [${tick()}]`);
const trunc = (s, n = 230) => (s.length > n ? s.slice(0, n) + "…" : s);

h("1. Saúde");
console.log(await api("GET", "/health"));

h("2. Projeto");
const project = await api("POST", "/projects", { body: { name: "Portal B2B — Distribuidora Horizonte", client: { company: "Distribuidora Horizonte (fictícia)", contact_name: "Ana Souza", contact_email: "ana@exemplo.com" } } });
console.log("project:", project.id);

h(`3. Reunião (${flag("--audio") ? "ÁUDIO" : "texto"})`);
let meeting;
if (flag("--audio")) {
  const file = path.join(root, "sample_data/sample_meeting.mp3");
  if (!fs.existsSync(file)) throw new Error("sample_data/sample_meeting.mp3 não existe (gere com `npm run tts:sample` em scripts/)");
  const form = new FormData();
  form.append("title", "Reunião de descoberta (áudio)");
  form.append("audio", new Blob([fs.readFileSync(file)], { type: "audio/mpeg" }), "sample_meeting.mp3");
  meeting = await api("POST", `/projects/${project.id}/meetings`, { form });
} else {
  const text = fs.readFileSync(path.join(root, "sample_data/sample_transcript_pt.txt"), "utf8");
  meeting = await api("POST", `/projects/${project.id}/meetings`, { body: { title: "Reunião de descoberta", transcript_text: text, language: "pt-BR" } });
}
console.log("meeting:", meeting.id, "status:", meeting.status);

h("4. Processamento (polling)");
let last = "";
for (;;) {
  meeting = await api("GET", `/meetings/${meeting.id}`);
  const line = `${meeting.status}${meeting.progress?.step ? " / " + meeting.progress.step : ""}`;
  if (line !== last) { console.log(`[${tick()}] ${line}`); last = line; }
  if (meeting.status === "analysis_ready") break;
  if (meeting.status === "failed") throw new Error(`Reunião falhou: ${JSON.stringify(meeting.error)}`);
  if (Date.now() - t0 > 6 * 60_000) throw new Error("timeout de 6 min");
  await new Promise((r) => setTimeout(r, 2500));
}
if (meeting.transcript) console.log("transcrição:", { palavras: meeting.transcript.text.split(/\s+/).length, segmentos: meeting.transcript.segments?.length, ...meeting.transcript.metadata });

h("5. Análise");
const a = await api("GET", `/meetings/${meeting.id}/analysis`);
console.log("modelo/prompt:", a.meta.model, "|", a.meta.prompt_version);
console.log(`itens: ${a.requirements.length} requisitos, ${a.decisions.length} decisões, ${a.commitments.length} compromissos, ${a.open_issues.length} pendências, ${a.tech_suggestions.length} sugestões`);
console.log("\nDECISÕES:"); for (const d of a.decisions) console.log(`  [${d.status}] ${trunc(d.description, 120)}`);
console.log("\nCOMPROMISSOS:"); for (const c of a.commitments) console.log(`  [${c.status}] ${c.owner}: ${trunc(c.description, 100)} (${c.due_text ?? "sem prazo"})`);
console.log("\nPENDÊNCIAS DO TIPO CONTRADIÇÃO:"); for (const i of a.open_issues.filter((x) => x.type === "contradiction")) console.log("  -", trunc(i.description, 160));
console.log("\nSUGESTÕES DA IA (não podem ser decisão):"); for (const s of a.tech_suggestions) console.log("  -", trunc(s.description, 110));
console.log("\nLIMITAÇÕES:"); for (const l of a.limitations) console.log("  -", trunc(l, 160));

h("6. Resumo da reunião");
const s = a.meeting_summary;
if (!s) console.log("SEM RESUMO (etapa não bloqueante falhou ou pipeline stub). Veja as limitações acima.");
else {
  console.log("MANCHETE:", s.headline, "\n\nRESUMO EXECUTIVO:\n" + s.executive_summary);
  console.log("\nTÓPICOS:"); s.topics.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}: ${trunc(t.summary, 140)}\n     "${trunc(t.source_refs[0]?.quote ?? "", 110)}"`));
  const dec = new Map(a.decisions.map((d) => [d.id, d])), com = new Map(a.commitments.map((c) => [c.id, c])), iss = new Map(a.open_issues.map((i) => [i.id, i]));
  console.log("\nDECISÕES CONFIRMADAS:", s.key_decisions.map((i) => trunc(dec.get(i)?.description ?? i, 80)));
  console.log("DECISÕES PENDENTES:  ", s.pending_decisions.map((i) => trunc(dec.get(i)?.description ?? i, 80)));
  console.log("PRÓXIMOS PASSOS:     ", s.next_steps.map((i) => `[${com.get(i)?.status}] ${com.get(i)?.owner}: ${trunc(com.get(i)?.description ?? i, 60)}`));
  console.log(`PONTOS EM ABERTO (${s.open_points.length}, máx. 5):`, s.open_points.map((i) => trunc(iss.get(i)?.description ?? i, 90)));
}

h("7. Concluir revisão (aceita pendentes como confirmados — só para a demo)");
await api("POST", `/meetings/${meeting.id}/analysis/complete-review`, { auth: true, body: { accept_pending_as_confirmed: true } });
console.log("revisão concluída");

h("8. Proposta");
const proposal = await api("POST", `/projects/${project.id}/proposals`, { auth: true, body: { meeting_id: meeting.id } });
const ver = await api("GET", `/proposals/${proposal.id}/versions/1`);
const c = ver.content;
console.log("proposal:", proposal.id, "| hash:", ver.content_hash.slice(0, 20) + "…");
console.log("\nTÍTULO:", c.title, "\nRESUMO EXECUTIVO:\n" + c.executive_summary);
console.log("\nCONTEXTO:", trunc(c.business_context, 300));
console.log("\nMÓDULOS:"); for (const m of c.modules) console.log(`  - ${m.name} [${m.complexity}]: ${trunc(m.description, 110)}`);
console.log("\nESTIMATIVA (motor determinístico):", `${c.estimates.total_hours_min}–${c.estimates.total_hours_max} h | ${c.total_weeks} semanas | confiança ${c.estimates.confidence}`);
console.log("EQUIPE:", c.team.map((t) => `${t.phase}: ${t.roles.map((r) => r.profile).join(", ")}`));
console.log("EXCLUSÕES:", c.exclusions);
console.log("PONTOS EM ABERTO NA PROPOSTA:", c.open_points.length);
console.log("COMERCIAL:", c.commercial.status, "—", c.commercial.disclaimer);
const raw = JSON.stringify(c);
console.log("\nTexto redigido pela IA? ", c.executive_summary === a.summary ? "NÃO (texto determinístico: o composer não rodou ou falhou; veja o log do servidor)" : "SIM (difere do resumo cru da análise)");
console.log("Marca 'Sugestão da IA' na arquitetura:", c.architecture.is_ai_suggestion === true);

if (flag("--pdf")) {
  h("9. PDF");
  await api("POST", `/proposals/${proposal.id}/versions/1/pdf`, { auth: true });
  const pdf = await api("GET", `/proposals/${proposal.id}/versions/1/pdf`);
  const out = path.join(root, "storage", `proposta-${proposal.id}.pdf`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pdf);
  console.log(`PDF salvo (${(pdf.length / 1024).toFixed(0)} KB):`, out);
}

if (flag("--approve")) {
  h("10. Aprovação");
  const ap = await api("POST", `/proposals/${proposal.id}/versions/1/approve`, { auth: true, body: { content_hash: ver.content_hash, note: "Aprovado no E2E" } });
  console.log("aprovada por", ap.approved_by ?? USER, "| status:", ap.status ?? "ok");
  try { await api("POST", `/proposals/${proposal.id}/versions`, { auth: true, body: { content: { ...c, title: "alterado" } } }); console.log("nova versão criada a partir da aprovada (esperado)"); } catch (e) { console.log(String(e.message).slice(0, 160)); }
}

h("Fim");
console.log(`Tempo total: ${tick()}`);
void raw;
