// Tipos de evento da timeline — API_SPEC §4.10.
export const EVENT_TYPES = {
  PROJECT_CREATED: "project.created",
  MEETING_CREATED: "meeting.created",
  MEETING_TRANSCRIBED: "meeting.transcribed",
  ANALYSIS_READY: "analysis.ready",
  ANALYSIS_REVIEWED: "analysis.reviewed",
  PROPOSAL_VERSION_CREATED: "proposal.version_created",
  PROPOSAL_APPROVED: "proposal.approved",
  DELIVERY_AUTHORIZED: "delivery.authorized",
  CHANNEL_SENT: "channel.sent",
  CHANNEL_FAILED: "channel.failed",
  CHANNEL_SKIPPED: "channel.skipped",
  CHANNEL_DELIVERED: "channel.delivered",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
