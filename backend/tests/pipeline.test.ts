import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionOutput, GapAuditOutput, MeetingAnalysis } from "../../shared/src/schemas/analysis.js";
import { AiOutputInvalidError, AiProviderError } from "../src/core/errors.js";

vi.mock("../src/integrations/openai/client.js", () => ({ structuredCompletion: vi.fn() }));
vi.mock("../src/services/aiAnalysis/summarize.js", () => ({ summarizeDetailed: vi.fn() }));

import { structuredCompletion } from "../src/integrations/openai/client.js";
import { analyzeMeeting } from "../src/services/aiAnalysis/pipeline.js";
import { summarizeDetailed } from "../src/services/aiAnalysis/summarize.js";
import type { Transcript } from "../src/services/transcription/types.js";

const root = path.resolve(import.meta.dirname, "..", "..");
const text = fs.readFileSync(path.join(root, "sample_data", "sample_transcript_pt.txt"), "utf8");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures", "ai", f), "utf8"));
const extraction = ExtractionOutput.parse(readJson("sample_extraction.json"));
const audit = GapAuditOutput.parse(readJson("sample_gap_audit.json"));

const transcript: Transcript = {
  text,
  segments: [],
  metadata: { language: "pt", duration_ms: null, has_speakers: true, has_timestamps: false, provider: "text", model: null },
};
const MEETING = "11111111-1111-4111-8111-111111111111";
const usage = { input_tokens: 1, output_tokens: 1 };
const summary = {
  headline: "h",
  executive_summary: "e",
  topics: [],
  key_decisions: [],
  pending_decisions: [],
  next_steps: [],
  open_points: [],
};

const mocked = vi.mocked(structuredCompletion);
type Call = { schemaName: string; input: string };
const calls = (): Call[] => mocked.mock.calls.map((c) => c[0] as unknown as Call);
const reply = (data: unknown) => ({ data, usage, latencyMs: 1 });
const clone = <T>(x: T): T => structuredClone(x);

/** Responde por etapa: cada fila é consumida em ordem; Error é lançado. */
function script(queues: { extraction?: unknown[]; gap_audit?: unknown[] }) {
  const q = { extraction: [...(queues.extraction ?? [extraction])], gap_audit: [...(queues.gap_audit ?? [audit])] };
  mocked.mockImplementation((async (o: Call) => {
    const next = q[o.schemaName as "extraction" | "gap_audit"].shift();
    if (next instanceof Error) throw next;
    return reply(next);
  }) as never);
}

beforeEach(() => {
  mocked.mockReset();
  vi.mocked(summarizeDetailed).mockReset();
  vi.mocked(summarizeDetailed).mockResolvedValue({ summary, limitations: ["nota do resumo"], promptVersion: "summarize@1.0", attempts: 1, usage });
});

describe("analyzeMeeting", () => {
  it("caminho feliz: monta MeetingAnalysis válida, meta e progresso", async () => {
    script({});
    const steps: string[] = [];
    const a = await analyzeMeeting(transcript, MEETING, { onProgress: (s) => steps.push(s) });
    expect(steps).toEqual(["extracting", "auditing", "summarizing"]);
    expect(calls().map((c) => c.schemaName)).toEqual(["extraction", "gap_audit"]);
    expect(MeetingAnalysis.safeParse(a).success).toBe(true);
    expect(a.meeting_id).toBe(MEETING);
    expect(a.meta.prompt_version).toMatch(/^extract@[\d.]+\+gap_audit@[\d.]+$/);
    expect(a.meta.model).toBeTruthy();
    expect(a.open_issues).toHaveLength(audit.open_issues.length);
    expect(a.meeting_summary?.meta).toMatchObject({ prompt_version: "summarize@1.0", basis: "analysis" });
    expect(a.limitations).toContain("nota do resumo");
    expect(a.transcript_metadata).toMatchObject({ source_type: "text", has_speakers: true });
  });

  it("repair da extração quando validateExtraction pede reprocesso (até 2 reenvios)", async () => {
    const bad = clone(extraction);
    bad.requirements[1]!.id = bad.requirements[0]!.id; // id duplicado
    script({ extraction: [bad, bad, extraction] });
    await analyzeMeeting(transcript, MEETING);
    const ex = calls().filter((c) => c.schemaName === "extraction");
    expect(ex).toHaveLength(3);
    expect(ex[0]!.input).not.toContain("Correções exigidas");
    expect(ex[1]!.input).toContain("Correções exigidas");
    expect(ex[1]!.input).toContain("IDs duplicados");
    expect(ex[2]!.input).toContain("IDs duplicados");
  });

  it("AiOutputInvalidError na extração também aciona repair com os erros", async () => {
    script({ extraction: [new AiOutputInvalidError("x", "kind: valor inválido"), extraction] });
    await analyzeMeeting(transcript, MEETING);
    const ex = calls().filter((c) => c.schemaName === "extraction");
    expect(ex).toHaveLength(2);
    expect(ex[1]!.input).toContain("kind: valor inválido");
  });

  it("falha após 3 tentativas: AiOutputInvalidError com violações em details", async () => {
    const bad = clone(extraction);
    bad.summary = "";
    script({ extraction: [bad, bad, bad] });
    const e = await analyzeMeeting(transcript, MEETING).catch((x) => x);
    expect(e).toBeInstanceOf(AiOutputInvalidError);
    expect(JSON.stringify(e.details)).toContain("summary vazio");
    expect(calls().filter((c) => c.schemaName === "extraction")).toHaveLength(3);
    expect(calls().some((c) => c.schemaName === "gap_audit")).toBe(false);
  });

  it("AiProviderError não é reenviado como repair", async () => {
    script({ extraction: [new AiProviderError("fora")] });
    await expect(analyzeMeeting(transcript, MEETING)).rejects.toBeInstanceOf(AiProviderError);
    expect(calls()).toHaveLength(1);
  });

  it("audit com related_ids inexistente reprocessa com feedback", async () => {
    const bad = clone(audit);
    bad.open_issues[0]!.related_ids = ["req_999"];
    script({ gap_audit: [bad, audit] });
    await analyzeMeeting(transcript, MEETING);
    const g = calls().filter((c) => c.schemaName === "gap_audit");
    expect(g).toHaveLength(2);
    expect(g[1]!.input).toContain("req_999");
  });

  it("aplica downgrades: decisão -> pending_validation, compromisso -> tentative; conditional intacto", async () => {
    const withDowngrades: GapAuditOutput = {
      ...audit,
      downgrades: [
        { id: "dec_01", to: "pending_validation", reason: "r1" },
        { id: "com_01", to: "tentative", reason: "r2" },
        { id: "com_03", to: "tentative", reason: "r3" },
      ],
    };
    script({ gap_audit: [withDowngrades] });
    const a = await analyzeMeeting(transcript, MEETING);
    expect(a.decisions.find((d) => d.id === "dec_01")!.status).toBe("pending_validation");
    expect(a.commitments.find((c) => c.id === "com_01")!.status).toBe("tentative");
    expect(a.commitments.find((c) => c.id === "com_03")!.status).toBe("conditional");
    expect(a.decisions.find((d) => d.id === "dec_02")!.status).toBe("confirmed");
    expect(a.limitations.join(" ")).toMatch(/dec_01/);
    // o resumo recebe a análise já rebaixada
    const passed = vi.mocked(summarizeDetailed).mock.calls[0]![1];
    expect(passed.decisions.find((d) => d.id === "dec_01")!.status).toBe("pending_validation");
  });

  it("falha do resumo não bloqueia: meeting_summary null e nota em limitations", async () => {
    script({});
    vi.mocked(summarizeDetailed).mockRejectedValue(new AiOutputInvalidError("Resumo inválido após 3 tentativas"));
    const a = await analyzeMeeting(transcript, MEETING);
    expect(a.meeting_summary).toBeNull();
    expect(a.limitations.some((l) => l.startsWith("Resumo da reunião não gerado:"))).toBe(true);
    expect(MeetingAnalysis.safeParse(a).success).toBe(true);
  });
});
