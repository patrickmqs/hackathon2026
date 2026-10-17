import { describe, expect, it } from "vitest";
import { toMeetingDto } from "../../src/core/serializers.js";
import type { MeetingRecord, TranscriptRecord } from "../../src/repositories/repo.js";

function meeting(status: string): MeetingRecord {
  return {
    id: "m1",
    projectId: "p1",
    sourceType: "text",
    status,
    title: null,
    audioPath: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const transcript: TranscriptRecord = {
  id: "t1",
  meetingId: "m1",
  text: "texto completo",
  segments: [],
  metadata: { language: "pt-BR" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("toMeetingDto", () => {
  it("expõe transcript quando analysis_ready", () => {
    const dto = toMeetingDto(meeting("analysis_ready"), transcript);
    expect(dto.transcript).toEqual({
      text: "texto completo",
      segments: [],
      metadata: { language: "pt-BR" },
    });
  });

  it("esconde transcript quando ainda analisando", () => {
    const dto = toMeetingDto(meeting("analyzing"), transcript);
    expect(dto.transcript).toBeNull();
  });
});
