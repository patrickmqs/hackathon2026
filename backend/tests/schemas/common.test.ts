import { describe, it, expect } from "vitest";
import {
  MeetingStatus,
  ReviewStatus,
  VersionStatus,
  DeliveryStatus,
  ChannelStatus,
  Channel,
  MEETING_STATUSES,
  REVIEW_STATUSES,
  VERSION_STATUSES,
  DELIVERY_STATUSES,
  CHANNEL_STATUSES,
  CHANNELS,
} from "../../src/schemas/common.js";

describe("schemas/common — enums (API_SPEC §3)", () => {
  it("MeetingStatus aceita todos os valores válidos e rejeita inválido", () => {
    for (const s of MEETING_STATUSES) expect(MeetingStatus.safeParse(s).success).toBe(true);
    expect(MeetingStatus.safeParse("bogus").success).toBe(false);
  });

  it("ReviewStatus aceita todos os valores válidos e rejeita inválido", () => {
    for (const s of REVIEW_STATUSES) expect(ReviewStatus.safeParse(s).success).toBe(true);
    expect(ReviewStatus.safeParse("bogus").success).toBe(false);
  });

  it("VersionStatus aceita todos os valores válidos e rejeita inválido", () => {
    for (const s of VERSION_STATUSES) expect(VersionStatus.safeParse(s).success).toBe(true);
    expect(VersionStatus.safeParse("bogus").success).toBe(false);
  });

  it("DeliveryStatus aceita todos os valores válidos e rejeita inválido", () => {
    for (const s of DELIVERY_STATUSES) expect(DeliveryStatus.safeParse(s).success).toBe(true);
    expect(DeliveryStatus.safeParse("bogus").success).toBe(false);
  });

  it("ChannelStatus aceita todos os valores válidos e rejeita inválido", () => {
    for (const s of CHANNEL_STATUSES) expect(ChannelStatus.safeParse(s).success).toBe(true);
    expect(ChannelStatus.safeParse("bogus").success).toBe(false);
  });

  it("Channel aceita gmail/whatsapp e rejeita outro", () => {
    for (const s of CHANNELS) expect(Channel.safeParse(s).success).toBe(true);
    expect(Channel.safeParse("telegram").success).toBe(false);
  });
});
