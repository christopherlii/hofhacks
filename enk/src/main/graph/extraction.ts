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

// Patterns to skip - UI artifacts, generic content
const SKIP_TITLE_PATTERNS = [
  /^untitled/i,
  /^loading/i,
  /^new tab/i,
  /^\s*$/,
  /^about:blank/i,
  /^settings/i,
  /^preferences/i,
];

function shouldSkipTitle(title: string): boolean {
  return SKIP_TITLE_PATTERNS.some(pattern => pattern.test(title));
}

function extractEntitiesFromActivity(
  store: EntityStore,
  getCurrentApp: () => string,
  appName: string,
  title: string,
  url: string | null,
  summary: string | null,
): void {
  if (shouldSkipTitle(title)) return;
  
  const pageContext =
    summary ||
    (title && url ? `${appName}: ${title}` : url || `${appName}: ${title || ''}`).slice(0, 200);

  // Don't add generic app names
  if (appName && appName !== 'Unknown' && appName.length > 2) {
    store.addEntity(appName, 'app', getCurrentApp, appName);
  }

  if (url) {
    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.replace(/^www\./, '');
      
      // Only add domain if it's not a generic one
      const genericDomains = ['google.com', 'bing.com', 'duckduckgo.com', 'localhost', '127.0.0.1'];
      if (!genericDomains.includes(domain)) {
        store.addEntity(domain, 'content', getCurrentApp, domain, pageContext);
      }

      // Extract social profiles
      const igMatch = url.match(/instagram\.com\/([^/?]+)/);
      if (igMatch && !['stories', 'p', 'reel', 'explore', 'accounts', 'direct', 'about'].includes(igMatch[1])) {
        store.addEntity(`@${igMatch[1]}`, 'person', getCurrentApp, 'instagram.com', pageContext);
      }

      const xMatch = url.match(/(?:twitter|x)\.com\/([^/?]+)/);
      if (
        xMatch &&
        !['home', 'search', 'explore', 'notifications', 'messages', 'i', 'settings', 'compose', 'login', 'logout'].includes(xMatch[1])
      ) {
        store.addEntity(`@${xMatch[1]}`, 'person', getCurrentApp, 'x.com', pageContext);
      }

      const ghMatch = url.match(/github\.com\/([^/?]+\/[^/?]+)/);
      if (ghMatch && !ghMatch[1].includes('settings') && !ghMatch[1].includes('notifications')) {
        store.addEntity(ghMatch[1], 'project', getCurrentApp, 'github.com', pageContext);
      }

      const liMatch = url.match(/linkedin\.com\/in\/([^/?]+)/);
      if (liMatch) {
        const name = liMatch[1].replace(/-/g, ' ').replace(/\d+$/, '').trim();
        if (name.length > 2) {
          store.addEntity(name, 'person', getCurrentApp, 'linkedin.com', pageContext);
        }
      }

      const redditMatch = url.match(/reddit\.com\/r\/([^/?]+)/);
      if (redditMatch && redditMatch[1].length > 2) {
        store.addEntity(`r/${redditMatch[1]}`, 'topic', getCurrentApp, 'reddit.com', pageContext);
      }
    } catch {
      // ignore URL parse errors
    }
  }

  if (title && title.length > 2) {
    // YouTube video titles
    if (url?.includes('youtube.com/watch') || url?.includes('youtu.be')) {
      const cleanTitle = title.replace(/\s*[-–—|]?\s*YouTube\s*$/, '').trim();
      if (cleanTitle.length > 5 && cleanTitle.length < 100) {
        store.addEntity(cleanTitle, 'content', getCurrentApp, 'youtube.com', pageContext);
      }
    }

    // Messaging app contacts
    if (['Messages', 'Telegram', 'WhatsApp', 'Signal', 'Discord', 'Slack', 'iMessage'].includes(appName)) {
      const cleanName = title.replace(/\s*[-–—|].*$/, '').trim();
      // More strict name validation
      if (cleanName.length > 1 && cleanName.length < 30 && !cleanName.match(/^\d+$/) && !cleanName.match(/^[^a-zA-Z]+$/)) {
        store.addEntity(cleanName, 'person', getCurrentApp, appName, pageContext);
      }
    }

    // @ mentions
    const mentions = title.match(/@[\w.-]{3,}/g);
    if (mentions) {
      mentions.slice(0, 3).forEach((mention) => {
        store.addEntity(mention, 'person', getCurrentApp, appName, pageContext);
      });
    }
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

  // Filter for meaningful snapshots
  const meaningfulSnapshots = newSnapshots.filter(
    snapshot => snapshot.summary || (snapshot.text?.trim().length ?? 0) >= 50
  );
  
  if (meaningfulSnapshots.length === 0) return;

  const summaryTexts = meaningfulSnapshots
    .filter((snapshot) => snapshot.summary && snapshot.summary.length > 20)
    .map((snapshot) => `[${snapshot.app}] ${snapshot.summary}`)
    .slice(-8);

  const screenTexts = meaningfulSnapshots
    .filter((snapshot) => (snapshot.text?.trim().length ?? 0) >= 50)
    .slice(-6)
    .map((snapshot) => {
      const text = (snapshot.text || '').slice(0, 300).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      return `[${snapshot.app}] ${snapshot.title || ''}: ${text}`;
    })
    .filter((s) => s.length > 50);

  const recentTitles = deps
    .getAllActivity()
    .slice(-12)
    .filter(activity => !shouldSkipTitle(activity.title))
    .map(
      (activity) =>
        `${activity.app}: "${activity.title}"${activity.url ? ` (${activity.url.slice(0, 60)})` : ''}${
          activity.summary ? ' — ' + activity.summary.slice(0, 100) : ''
        }`
    )
    .join('\n');

  const clipTexts = deps
    .getClipboardLog()
    .slice(-3)
    .filter(entry => entry.text.length > 10 && entry.text.length < 500)
    .map((entry) => `Clipboard: "${entry.text.slice(0, 120)}"`)
    .join('\n');

  const input = [recentTitles, summaryTexts.join('\n'), screenTexts.length ? 'Screen content:\n' + screenTexts.join('\n') : '', clipTexts].filter(Boolean).join('\n\n');
  if (input.length < 50) return;

  const data = await deps.claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    system: `Extract MEANINGFUL personal entities and relationships from computer activity. Focus on things the user would actually care about and recognize.

Return JSON:
{"entities": [{"label": "name", "type": "person|topic|project|content|place|goal", "confidence": "high|medium"}], "relations": [{"from": "label1", "to": "label2", "relation": "type"}]}

ENTITY RULES:
- PERSON: Real names or usernames of people the user interacts with. NOT generic roles.
- PROJECT: Named projects, repos, or ongoing work. Must be specific.
- TOPIC: Subjects the user is clearly interested in. NOT generic terms like "technology" or "news".
- PLACE: Specific locations meaningful to the user.
- GOAL: Plans, intentions, or aspirations.
- CONTENT: Specific articles, videos, or documents engaged with.

SKIP:
- UI elements, navigation text, generic app names
- Single words that are too vague
- Anything that looks like OCR noise
- Generic terms ("user", "page", "document")

RELATION TYPES:
- working_on: Person actively working on a project
- collaborating_with: People working together
- interested_in: Person has clear interest in topic
- planning: Related to a goal or plan
- located_at: Person/project associated with place
- related_to: General association (use sparingly)

Max 8 entities, 4 relations. Quality over quantity.`,
    messages: [{ role: 'user', content: input }],
  });

  if (!data) return;
  const text = data.content?.[0]?.text;
  if (!text) return;

  const objMatch = text.match(/\{[\s\S]*\}/);
  const arrMatch = text.match(/\[[\s\S]*\]/);

  try {
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]) as {
        entities?: { label: string; type: EntityNode['type']; confidence: string }[];
        relations?: { from: string; to: string; relation: string }[];
      };
      const entities = parsed.entities ?? [];
      const relations = parsed.relations ?? [];

      // Use a more specific context hint
      const contextHint = `${deps.getCurrentApp()}:${Date.now()}`;
      
      for (const entity of entities) {
        if (!entity.label || !entity.type) continue;
        if (entity.label.length < 2 || entity.label.length > 50) continue;
        
        entityStore.addEntity(entity.label, entity.type, deps.getCurrentApp, 'ai-extract', contextHint);
        if (entity.confidence === 'high') {
          const id = `${entity.type}:${normalizeEntity(entity.label)}`;
          const node = entityStore.nodes.get(id);
          if (node) node.verified = true;
        }
      }

      for (const rel of relations) {
        if (rel.from && rel.to && rel.relation) {
          entityStore.addRelation(rel.from.trim(), rel.to.trim(), rel.relation);
        }
      }

      if (entities.length > 0 || relations.length > 0) {
        console.log(`[Enk] AI extracted: ${entities.map((e) => e.label).join(', ')}${relations.length ? `; ${relations.length} relations` : ''}`);
      }
      return;
    }
    if (arrMatch) {
      const entities: { label: string; type: EntityNode['type']; confidence: string }[] = JSON.parse(arrMatch[0]);
      const contextHint = `${deps.getCurrentApp()}:${Date.now()}`;
      
      for (const entity of entities) {
        if (!entity.label || !entity.type) continue;
        if (entity.label.length < 2 || entity.label.length > 50) continue;
        
        entityStore.addEntity(entity.label, entity.type, deps.getCurrentApp, 'ai-extract', contextHint);
        if (entity.confidence === 'high') {
          const id = `${entity.type}:${normalizeEntity(entity.label)}`;
          const node = entityStore.nodes.get(id);
          if (node) node.verified = true;
        }
      }
      if (entities.length > 0) {
        console.log(`[Enk] AI extracted: ${entities.map((e) => e.label).join(', ')}`);
      }
    }
  } catch {
    // ignore parse errors
  }
}

export { extractEntitiesFromActivity, aiExtractEntities };
