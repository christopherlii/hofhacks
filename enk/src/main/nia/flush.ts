import type { NiaClient } from '../../nia-client';
import { flushToNia as flushToNiaFromModule } from './sync';

import type { ActivityEntry, ClaudeRequestBody, ClaudeResponse, ContentSnapshot } from '../../types';

interface CreateFlushDeps {
  getStore: () => any;
  nia: NiaClient;
  getCurrentWindow: () => { app: string; title: string; url: string | null; since: number };
  minDurationMs: number;
  activityLog: ActivityEntry[];
  contentSnapshots: ContentSnapshot[];
  pendingSummaries: ContentSnapshot[];
  getAllActivity: () => ActivityEntry[];
  getAllSnapshots: () => ContentSnapshot[];
  extractEntitiesFromActivity: (appName: string, title: string, url: string | null, summary: string | null) => void;
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  appendKnowledge: (facts: string[]) => void;
  getLoadedActivity: () => ActivityEntry[];
  setLoadedActivity: (items: ActivityEntry[]) => void;
  getLoadedSnapshots: () => ContentSnapshot[];
  setLoadedSnapshots: (items: ContentSnapshot[]) => void;
  persistedActivityMax: number;
  persistedSnapshotsMax: number;
}

function createFlushToNia(deps: CreateFlushDeps) {
  return async function flushToNia(): Promise<void> {
    let flushedActivity: ActivityEntry[] = [];
    let flushedSnapshots: ContentSnapshot[] = [];

    await flushToNiaFromModule({
      store: deps.getStore(),
      nia: deps.nia,
      currentWindow: deps.getCurrentWindow(),
      minDurationMs: deps.minDurationMs,
      activityLog: deps.activityLog,
      contentSnapshots: deps.contentSnapshots,
      pendingSummaries: deps.pendingSummaries,
      getAllActivity: deps.getAllActivity,
      getAllSnapshots: deps.getAllSnapshots,
      extractEntitiesFromActivity: deps.extractEntitiesFromActivity,
      claudeRequest: deps.claudeRequest,
      appendKnowledge: deps.appendKnowledge,
      onFlushed: (payload) => {
        flushedActivity = payload.flushedActivity;
        flushedSnapshots = payload.flushedSnapshots;
      },
    });

    if (flushedActivity.length === 0 && flushedSnapshots.length === 0) return;

    const combinedActivity = [...deps.getLoadedActivity(), ...flushedActivity]
      .sort((a, b) => a.start - b.start)
      .slice(-deps.persistedActivityMax);

    const combinedSnapshots = [...deps.getLoadedSnapshots(), ...flushedSnapshots]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-deps.persistedSnapshotsMax);

    try {
      deps.getStore()?.set('persistedActivity', combinedActivity);
      deps.getStore()?.set(
        'persistedSnapshots',
        combinedSnapshots.map((snapshot) => ({
          timestamp: snapshot.timestamp,
          app: snapshot.app,
          title: snapshot.title,
          url: snapshot.url,
          text: snapshot.text.slice(0, 400),
          fullText: '',
          summary: snapshot.summary,
        }))
      );
    } catch {
      // ignore persistence failures
    }

    deps.setLoadedActivity(combinedActivity);
    deps.setLoadedSnapshots(combinedSnapshots);
  };
}

export { createFlushToNia };
