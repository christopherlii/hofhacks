interface SessionStatsPayload {
  activityEntries: number;
  contentSnapshots: number;
  pendingSummaries: number;
  currentApp: string;
  sessionStart: number;
  knowledgeSize: number;
  entityCount: number;
  clipboardCount: number;
  nowPlayingCount: number;
  cacheAge: number;
}

interface UnderstandingPreviewPayload {
  knowledge: string;
  activityCount: number;
  snapshotCount: number;
  entityCount: number;
}

function buildSessionStats(payload: SessionStatsPayload): SessionStatsPayload {
  return payload;
}

function buildUnderstandingPreview(payload: UnderstandingPreviewPayload): UnderstandingPreviewPayload {
  return payload;
}

export { buildSessionStats, buildUnderstandingPreview };
