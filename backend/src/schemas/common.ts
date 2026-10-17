import { z } from "zod";

// Enums compartilhados — API_SPEC §3.
// Arrays const para iteração + schemas Zod para validação e tipagem TS.

export const MEETING_STATUSES = [
  "created",
  "transcribing",
  "analyzing",
  "analysis_ready",
  "reviewed",
  "failed",
] as const;

export const REVIEW_STATUSES = [
  "pending",
  "confirmed",
  "edited",
  "rejected",
  "needs_clarification",
] as const;

export const VERSION_STATUSES = ["draft", "approved", "superseded"] as const;

export const DELIVERY_STATUSES = [
  "authorized",
  "in_progress",
  "completed",
  "partially_failed",
  "failed",
] as const;

export const CHANNEL_STATUSES = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "skipped_no_credentials",
] as const;

export const CHANNELS = ["gmail", "whatsapp"] as const;

export const MeetingStatus = z.enum(MEETING_STATUSES);
export const ReviewStatus = z.enum(REVIEW_STATUSES);
export const VersionStatus = z.enum(VERSION_STATUSES);
export const DeliveryStatus = z.enum(DELIVERY_STATUSES);
export const ChannelStatus = z.enum(CHANNEL_STATUSES);
export const Channel = z.enum(CHANNELS);

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export const Confidence = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof Confidence>;

export type MeetingStatus = z.infer<typeof MeetingStatus>;
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export type VersionStatus = z.infer<typeof VersionStatus>;
export type DeliveryStatus = z.infer<typeof DeliveryStatus>;
export type ChannelStatus = z.infer<typeof ChannelStatus>;
export type Channel = z.infer<typeof Channel>;
