import type { ClaudeRequestBody, ClaudeResponse, ContentSnapshot, EntityNode } from '../../types';
import { EntityStore, normalizeEntity } from './entity-store';

interface ExtractionDeps {
  getStore: () => any;
  getCurrentApp: () => string;
  getAllActivity: () => { app: string; title: string; url: string | null; summary: string | null }[];
  getContentSnapshots: () => ContentSnapshot[];
  getClipboardLog: () => { text: string; timestamp: number; app: string }[];
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
}

function extractEntitiesFromActivity(
  store: EntityStore,
  getCurrentApp: () => string,
  appName: string,
  title: string,
  url: string | null,
  summary: string | null,
): void {
  const pageContext =
    summary ||
    (title && url ? `${appName}: ${title}` : url || `${appName}: ${title || ''}`).slice(0, 200);

  if (appName && appName !== 'Unknown') store.addEntity(appName, 'app', getCurrentApp, appName);

  if (url) {
    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.replace(/^www\./, '');
      store.addEntity(domain, 'content', getCurrentApp, domain, pageContext);

      const igMatch = url.match(/instagram\.com\/([^/?]+)/);
      if (igMatch && !['stories', 'p', 'reel', 'explore', 'accounts', 'direct'].includes(igMatch[1])) {
        store.addEntity(`@${igMatch[1]}`, 'person', getCurrentApp, 'instagram.com', pageContext);
      }

      const xMatch = url.match(/(?:twitter|x)\.com\/([^/?]+)/);
      if (
        xMatch &&
        !['home', 'search', 'explore', 'notifications', 'messages', 'i', 'settings', 'compose'].includes(xMatch[1])
      ) {
        store.addEntity(`@${xMatch[1]}`, 'person', getCurrentApp, 'x.com', pageContext);
      }

      const ghMatch = url.match(/github\.com\/([^/?]+\/[^/?]+)/);
      if (ghMatch) store.addEntity(ghMatch[1], 'project', getCurrentApp, 'github.com', pageContext);

      const liMatch = url.match(/linkedin\.com\/in\/([^/?]+)/);
      if (liMatch) store.addEntity(liMatch[1].replace(/-/g, ' '), 'person', getCurrentApp, 'linkedin.com', pageContext);

      const redditMatch = url.match(/reddit\.com\/r\/([^/?]+)/);
      if (redditMatch) store.addEntity(`r/${redditMatch[1]}`, 'topic', getCurrentApp, 'reddit.com', pageContext);
    } catch {
      // ignore URL parse errors
    }
  }

  if (title && title.length > 2) {
    if (url?.includes('youtube.com/watch') || url?.includes('youtu.be')) {
      const cleanTitle = title.replace(/\s*[-–—|]?\s*YouTube\s*$/, '').trim();
      if (cleanTitle.length > 3) store.addEntity(cleanTitle, 'content', getCurrentApp, 'youtube.com', pageContext);
    }

    if (['Messages', 'Telegram', 'WhatsApp', 'Signal', 'Discord', 'Slack', 'iMessage'].includes(appName)) {
      const cleanName = title.replace(/\s*[-–—|].*$/, '').trim();
      if (cleanName.length > 1 && cleanName.length < 40) {
        store.addEntity(cleanName, 'person', getCurrentApp, appName, pageContext);
      }
    }

    const mentions = title.match(/@[\w.-]+/g);
    if (mentions) mentions.forEach((mention) => store.addEntity(mention, 'person', getCurrentApp, appName, pageContext));
  }
}

async function aiExtractEntities(
  entityStore: EntityStore,
  deps: ExtractionDeps,
  lastAiExtractIndex: { value: number },
): Promise<void> {
  const store = deps.getStore();
  if (!store?.get('anthropicKey')) return;

  const contentSnapshots = deps.getContentSnapshots();
  const newSnapshots = contentSnapshots.slice(lastAiExtractIndex.value);
  if (newSnapshots.length === 0) return;
  lastAiExtractIndex.value = contentSnapshots.length;

  const summaryTexts = newSnapshots
    .filter((snapshot) => snapshot.summary)
    .map((snapshot) => `[${snapshot.app}] ${snapshot.summary}`)
    .slice(-10);

  const recentTitles = deps
    .getAllActivity()
    .slice(-15)
    .map(
      (activity) =>
        `${activity.app}: "${activity.title}"${activity.url ? ` (${activity.url})` : ''}${
          activity.summary ? ' — ' + activity.summary : ''
        }`
    )
    .join('\n');

  const clipTexts = deps
    .getClipboardLog()
    .slice(-5)
    .map((entry) => `Clipboard: "${entry.text.slice(0, 150)}"`)
    .join('\n');

  const input = [recentTitles, summaryTexts.join('\n'), clipTexts].filter(Boolean).join('\n\n');
  if (input.length < 30) return;

  const data = await deps.claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    system: `Extract meaningful personal entities from computer activity. Return JSON array of objects.

Each object: {"label": "name", "type": "person|topic|project|content|place", "confidence": "high|medium"}

Rules:
- PEOPLE: real names, usernames, contacts. NOT app names, NOT generic words.
- TOPICS: specific subjects the user is researching or interested in (e.g. "machine learning", "Japan travel", "mechanical keyboards"). NOT generic words like "Settings" or "Loading".
- PROJECTS: named projects, repos, codebases.
- CONTENT: specific videos, articles, songs, podcasts by title.
- PLACES: cities, countries, restaurants, venues.
- Only extract entities with PERSONAL RELEVANCE to the user.
- Skip UI elements, generic navigation, system processes.
- Max 10 entities. Return [] if nothing meaningful.`,
    messages: [{ role: 'user', content: input }],
  });

  if (!data) return;
  const text = data.content?.[0]?.text;
  if (!text) return;

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return;

  try {
    const entities: { label: string; type: EntityNode['type']; confidence: string }[] = JSON.parse(match[0]);
    const contextHint = `ai:${input.slice(0, 150)}`;
    for (const entity of entities) {
      if (!entity.label || !entity.type) continue;
      entityStore.addEntity(entity.label, entity.type, deps.getCurrentApp, 'ai-extract', contextHint);
      if (entity.confidence === 'high') {
        const id = `${entity.type}:${normalizeEntity(entity.label)}`;
        const node = entityStore.nodes.get(id);
        if (node) node.verified = true;
      }
    }

    if (entities.length > 0) {
      console.log(`[Enk] AI extracted: ${entities.map((entity) => entity.label).join(', ')}`);
    }
  } catch {
    // ignore parse errors
  }
}

export { extractEntitiesFromActivity, aiExtractEntities };
