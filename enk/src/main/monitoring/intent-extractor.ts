import type { ActivityEntry, ClaudeRequestBody, ClaudeResponse, ContentSnapshot } from '../../types';

interface ClipboardEntry {
  text: string;
}

interface NowPlayingEntry {
  track: string;
  artist: string;
}

interface FastIntentDeps {
  hasApiKey: boolean;
  recentEntries: ActivityEntry[];
  recentSnapshots: ContentSnapshot[];
  recentClipboard: ClipboardEntry[];
  recentNowPlaying: NowPlayingEntry[];
  localKnowledge: string;
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  appendKnowledge: (facts: string[]) => void;
}

async function extractFastIntent(deps: FastIntentDeps): Promise<void> {
  if (!deps.hasApiKey) return;
  if (deps.recentEntries.length === 0 && deps.recentSnapshots.length === 0) return;

  const activityText = deps.recentEntries
    .map((entry) => {
      const summaryStr = entry.summary ? ` — ${entry.summary}` : '';
      return `${entry.app}: "${entry.title}"${entry.url ? ` (${entry.url})` : ''}${summaryStr}`;
    })
    .join('\n');

  const contentText = deps.recentSnapshots
    .map((snapshot) => `[${snapshot.app}] ${snapshot.summary || snapshot.text.slice(0, 150)}`)
    .join('\n');

  const clipText = deps.recentClipboard.map((c) => `Copied: "${c.text.slice(0, 100)}"`).join('\n');
  const musicText = deps.recentNowPlaying.map((n) => `Listening: "${n.track}" by ${n.artist}`).join('\n');

  const combined = [activityText, contentText, clipText, musicText].filter(Boolean).join('\n\n');
  if (combined.length < 50) return;

  const data = await deps.claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system:
      `Extract specific personal facts from recent activity. Output JSON array of strings. Focus on: content consumed (specific titles/topics), people interacted with, interests shown, goals/plans implied. Skip generic facts. Max 5 facts. Return [] if nothing noteworthy.\n\nAlready known:\n${deps.localKnowledge.slice(0, 1000) || '(nothing yet)'}`,
    messages: [{ role: 'user', content: combined }],
  });

  if (!data) return;
  const text = data.content?.[0]?.text;
  if (!text) return;

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return;

  const facts: string[] = JSON.parse(match[0]);
  if (facts.length === 0) return;

  deps.appendKnowledge(facts);
  console.log(`[Enk] Fast intent: ${facts.join('; ')}`);
}

export { extractFastIntent };
