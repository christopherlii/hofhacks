import type { NiaClient } from '../../nia-client';
import type { ActivityEntry, ClaudeRequestBody, ClaudeResponse, ContentSnapshot } from '../../types';

interface FlushToNiaDeps {
  store: any;
  nia: NiaClient;
  currentWindow: { app: string; title: string; url: string | null; since: number };
  minDurationMs: number;
  activityLog: ActivityEntry[];
  contentSnapshots: ContentSnapshot[];
  pendingSummaries: ContentSnapshot[];
  getAllActivity: () => ActivityEntry[];
  getAllSnapshots: () => ContentSnapshot[];
  extractEntitiesFromActivity: (appName: string, title: string, url: string | null, summary: string | null) => void;
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  appendKnowledge: (facts: string[]) => void;
  onFlushed?: (payload: { flushedActivity: ActivityEntry[]; flushedSnapshots: ContentSnapshot[] }) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function extractIntents(
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>,
  store: any,
  nia: NiaClient,
  activityContent: string,
  date: string,
  appendKnowledge: (facts: string[]) => void
): Promise<void> {
  if (!store.get('anthropicKey') || !activityContent.trim()) return;

  try {
    const data = await claudeRequest({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: `Extract high-value personal insights from this activity log. Focus on:\n- Content consumed (specific videos/articles/topics)\n- People interacted with\n- Interests/hobbies inferred\n- Projects worked on\n- Goals/plans implied\n\nReturn ONLY JSON array of strings, max 6 insights. Be specific.`,
      messages: [{ role: 'user', content: activityContent.slice(0, 6000) }],
    });

    if (!data) return;
    const text = data.content?.[0]?.text;
    if (!text) return;

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;

    const intents: string[] = JSON.parse(match[0]);
    if (intents.length === 0) return;

    appendKnowledge(intents);

    await nia.saveContext({
      title: `Intent Summary - ${date}`,
      summary: intents.join('; '),
      content: intents.map((intent) => `- ${intent}`).join('\n'),
      tags: ['intent', date],
      memoryType: 'fact',
    });

    console.log(`[Enk] Extracted intents: ${intents.join('; ')}`);
  } catch (err: any) {
    console.error('[Enk] Intent extraction failed:', err.message);
  }
}

async function flushToNia(deps: FlushToNiaDeps): Promise<void> {
  if (!deps.store.get('niaKey')) return;
  deps.nia.setApiKey(deps.store.get('niaKey') as string);

  const now = Date.now();
  if (deps.currentWindow.app && now - deps.currentWindow.since >= deps.minDurationMs) {
    deps.activityLog.push({
      app: deps.currentWindow.app,
      title: deps.currentWindow.title,
      url: deps.currentWindow.url,
      start: deps.currentWindow.since,
      end: now,
      duration: now - deps.currentWindow.since,
      summary: null,
    });
    deps.currentWindow.since = now;
  }

  if (deps.activityLog.length === 0 && deps.contentSnapshots.length === 0) return;

  const date = formatDate(now);
  const hour = formatTime(now).slice(0, 2);

  const lines: string[] = [];
  const sortedActivity = [...deps.activityLog].sort((a, b) => a.start - b.start);
  for (const entry of sortedActivity) {
    const mins = Math.round(entry.duration / 60000);
    const line = `- [${formatTime(entry.start)}-${formatTime(entry.end)}] ${entry.app} (${mins}m): ${entry.title}${
      entry.url ? ` | ${entry.url}` : ''
    }${entry.summary ? ` | ${entry.summary}` : ''}`;
    lines.push(line);
    deps.extractEntitiesFromActivity(entry.app, entry.title, entry.url, entry.summary);
  }

  const snapshots = [...deps.contentSnapshots].sort((a, b) => a.timestamp - b.timestamp);
  if (snapshots.length > 0) {
    lines.push('\n## Screen Insights');
    for (const snapshot of snapshots) {
      const base = `- [${formatTime(snapshot.timestamp)}] ${snapshot.app}: ${snapshot.title}`;
      const text = snapshot.summary || snapshot.text || '';
      lines.push(`${base} → ${text.slice(0, 300).replace(/\n+/g, ' ')}`);
      deps.extractEntitiesFromActivity(snapshot.app, snapshot.title, snapshot.url, snapshot.summary);
    }
  }

  const activityContent = `# Activity Log ${date} Hour ${hour}\n\n${lines.join('\n')}`;

  try {
    await deps.nia.saveContext({
      title: `Activity ${date} ${hour}:00`,
      summary: `${deps.activityLog.length} app switches, ${deps.contentSnapshots.length} snapshots`,
      content: activityContent,
      tags: ['daily-log', date, `hour-${hour}`],
      memoryType: 'raw',
    });

    await extractIntents(deps.claudeRequest, deps.store, deps.nia, activityContent, date, deps.appendKnowledge);

    console.log(
      `[Enk] Flushed activity to Nia: ${date} hour ${hour} (${deps.activityLog.length} switches, ${deps.contentSnapshots.length} snapshots)`
    );
  } catch (err: any) {
    console.error('[Enk] Nia flush failed:', err.message);
  }

  const flushedActivity = [...deps.activityLog];
  const flushedSnapshots = [...deps.contentSnapshots];
  deps.onFlushed?.({ flushedActivity, flushedSnapshots });

  deps.activityLog.length = 0;
  deps.contentSnapshots.length = 0;
  deps.pendingSummaries.length = 0;
}

export { flushToNia };
