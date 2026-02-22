import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, Notification, screen, systemPreferences, net, NativeImage, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import { NiaClient, NiaContext } from './nia-client';

// ─── Types ──────────────────────────────────────────────────────
interface WindowInfo {
  app: string;
  title: string;
  url: string | null;
}

interface BrowserInfo {
  url: string | null;
  tabTitle: string | null;
}

interface ActivityEntry {
  app: string;
  title: string;
  url: string | null;
  start: number;
  end: number;
  duration: number;
  summary: string | null;
}

interface ContentSnapshot {
  timestamp: number;
  app: string;
  title: string;
  url: string | null;
  text: string;
  fullText: string;
  summary: string | null;
}

interface ScreenCapture {
  id: string;
  name: string;
  nativeImage: NativeImage;
}

interface OcrResult {
  text: string;
  confidence: number;
}

interface ScamResult {
  flagged: boolean;
  risk_level: string;
  reason: string;
}

interface ClaudeResponse {
  content?: { text: string }[];
  error?: any;
}

interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: string; content: any }[];
}

interface Settings {
  anthropicKey: string;
  niaKey: string;
  enabled: boolean;
  scamDetection: boolean;
  firstLaunch: boolean;
}

// ─── Entity Graph ───────────────────────────────────────────────
interface EntityNode {
  id: string;
  label: string;
  type: 'person' | 'topic' | 'app' | 'content' | 'place' | 'project';
  weight: number;
  firstSeen: number;
  lastSeen: number;
  contexts: string[]; // distinct apps/domains where this entity appeared
  verified: boolean;  // AI has confirmed this is a real entity, not noise
}

interface EntityEdge {
  source: string;
  target: string;
  weight: number;
}

const entityNodes: Map<string, EntityNode> = new Map();
const entityEdges: Map<string, EntityEdge> = new Map();
const CONTEXT_HINT_MAX = 100; // keep last N context-based co-occurrence entries
const recentEntityContexts: { entity: string; contextHint: string }[] = [];
let graphSaveTimer: ReturnType<typeof setInterval> | null = null;
const GRAPH_SAVE_INTERVAL_MS = 10 * 60 * 1000; // auto-save every 10 min
const GRAPH_DECAY_STALE_DAYS = 7;
const GRAPH_DECAY_MIN_WEIGHT = 2; // keep entities with weight >= 2 regardless of age

function saveGraphToStore(): void {
  if (!store) return;
  try {
    const nodes = Array.from(entityNodes.values());
    const edges = Array.from(entityEdges.entries()).map(([key, e]) => ({ key, ...e }));
    store.set('graphNodes', nodes);
    store.set('graphEdges', edges);

    const combinedActivity = [...loadedActivity, ...activityLog].sort((a, b) => a.start - b.start).slice(-PERSISTED_ACTIVITY_MAX);
    const combinedSnapshots = [...loadedSnapshots, ...contentSnapshots].sort((a, b) => a.timestamp - b.timestamp).slice(-PERSISTED_SNAPSHOTS_MAX);
    store.set('persistedActivity', combinedActivity);
    store.set('persistedSnapshots', combinedSnapshots.map(s => ({
      timestamp: s.timestamp, app: s.app, title: s.title, url: s.url,
      text: s.text.slice(0, 400), fullText: '', summary: s.summary,
    })));

    console.log(`[Enk] Graph saved: ${nodes.length} nodes, ${edges.length} edges; ${combinedActivity.length} activity, ${combinedSnapshots.length} snapshots`);
  } catch (err: any) {
    console.error('[Enk] Graph save failed:', err.message);
  }
}

function loadGraphFromStore(): void {
  if (!store) return;
  try {
    const nodes: any[] = store.get('graphNodes') as any[] || [];
    const edges: { key: string; source: string; target: string; weight: number }[] = store.get('graphEdges') as any[] || [];
    for (const n of nodes) {
      entityNodes.set(n.id, {
        ...n,
        contexts: n.contexts || [],
        verified: n.verified || false,
      });
    }
    for (const e of edges) entityEdges.set(e.key, { source: e.source, target: e.target, weight: e.weight });
    if (nodes.length > 0) console.log(`[Enk] Graph loaded: ${nodes.length} nodes, ${edges.length} edges`);
  } catch (err: any) {
    console.error('[Enk] Graph load failed:', err.message);
  }
}

function decayGraph(): void {
  const cutoff = Date.now() - GRAPH_DECAY_STALE_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const [id, node] of entityNodes) {
    if (node.weight < GRAPH_DECAY_MIN_WEIGHT && node.lastSeen < cutoff) {
      entityNodes.delete(id);
      pruned++;
    }
  }
  // Remove orphaned edges
  for (const [key, edge] of entityEdges) {
    if (!entityNodes.has(edge.source) || !entityNodes.has(edge.target)) {
      entityEdges.delete(key);
    }
  }
  if (pruned > 0) {
    console.log(`[Enk] Graph decay: pruned ${pruned} stale entities`);
    saveGraphToStore();
  }
}

const SKIP_ENTITIES = new Set([
  '', 'the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'your',
  'http', 'https', 'www', 'com', 'org', 'net', 'html', 'undefined', 'null',
  'new', 'tab', 'untitled', 'loading', 'about:blank',
]);

function normalizeEntity(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^\w\s@#-]/g, '').trim();
}

function addEntity(label: string, type: EntityNode['type'], sourceContext?: string, contextHintForEdge?: string): void {
  const normalized = normalizeEntity(label);
  const id = `${type}:${normalized}`;
  if (SKIP_ENTITIES.has(normalized) || normalized.length < 2) return;

  const ctx = sourceContext || currentWindow.app || 'unknown';
  const now = Date.now();
  const existing = entityNodes.get(id);
  if (existing) {
    existing.weight++;
    existing.lastSeen = now;
    if (!existing.contexts.includes(ctx)) existing.contexts.push(ctx);
  } else {
    entityNodes.set(id, { id, label: label.trim(), type, weight: 1, firstSeen: now, lastSeen: now, contexts: [ctx], verified: false });
  }
  if (contextHintForEdge && contextHintForEdge.length > 5) {
    recentEntityContexts.push({ entity: id, contextHint: contextHintForEdge });
    updateCoOccurrences(id, contextHintForEdge);
  }
}

function updateCoOccurrences(newEntityId: string, newContextHint: string): void {
  for (const entry of recentEntityContexts) {
    if (entry.entity === newEntityId) continue;
    if (entry.contextHint !== newContextHint) continue;
    const edgeKey = [entry.entity, newEntityId].sort().join('↔');
    const existing = entityEdges.get(edgeKey);
    if (existing) {
      existing.weight++;
    } else {
      entityEdges.set(edgeKey, { source: entry.entity, target: newEntityId, weight: 1 });
    }
  }
  while (recentEntityContexts.length > CONTEXT_HINT_MAX) {
    recentEntityContexts.shift();
  }
}

function extractEntitiesFromActivity(appName: string, title: string, url: string | null, summary: string | null): void {
  const pageContext = summary || (title && url ? `${appName}: ${title}` : url || `${appName}: ${title || ''}`).slice(0, 200);

  if (appName && appName !== 'Unknown') addEntity(appName, 'app', appName);

  if (url) {
    try {
      const u = new URL(url);
      const domain = u.hostname.replace(/^www\./, '');
      addEntity(domain, 'content', domain, pageContext);

      const igMatch = url.match(/instagram\.com\/([^/?]+)/);
      if (igMatch && !['stories', 'p', 'reel', 'explore', 'accounts', 'direct'].includes(igMatch[1])) {
        addEntity(`@${igMatch[1]}`, 'person', 'instagram.com', pageContext);
      }
      const xMatch = url.match(/(?:twitter|x)\.com\/([^/?]+)/);
      if (xMatch && !['home', 'search', 'explore', 'notifications', 'messages', 'i', 'settings', 'compose'].includes(xMatch[1])) {
        addEntity(`@${xMatch[1]}`, 'person', 'x.com', pageContext);
      }
      const ghMatch = url.match(/github\.com\/([^/?]+\/[^/?]+)/);
      if (ghMatch) addEntity(ghMatch[1], 'project', 'github.com', pageContext);

      const liMatch = url.match(/linkedin\.com\/in\/([^/?]+)/);
      if (liMatch) addEntity(liMatch[1].replace(/-/g, ' '), 'person', 'linkedin.com', pageContext);

      const redditMatch = url.match(/reddit\.com\/r\/([^/?]+)/);
      if (redditMatch) addEntity(`r/${redditMatch[1]}`, 'topic', 'reddit.com', pageContext);
    } catch {}
  }

  if (title && title.length > 2) {
    if (url?.includes('youtube.com/watch') || url?.includes('youtu.be')) {
      const cleanTitle = title.replace(/\s*[-–—|]?\s*YouTube\s*$/, '').trim();
      if (cleanTitle.length > 3) addEntity(cleanTitle, 'content', 'youtube.com', pageContext);
    }

    if (['Messages', 'Telegram', 'WhatsApp', 'Signal', 'Discord', 'Slack', 'iMessage'].includes(appName)) {
      const cleanName = title.replace(/\s*[-–—|].*$/, '').trim();
      if (cleanName.length > 1 && cleanName.length < 40) {
        addEntity(cleanName, 'person', appName, pageContext);
      }
    }

    const mentions = title.match(/@[\w.-]+/g);
    if (mentions) mentions.forEach(m => addEntity(m, 'person', appName, pageContext));
  }
}

// AI-powered entity extraction -- runs periodically on accumulated summaries
let aiExtractTimer: ReturnType<typeof setInterval> | null = null;
let lastAiExtractIndex = 0;

async function aiExtractEntities(): Promise<void> {
  if (!store?.get('anthropicKey')) return;

  const newSnapshots = contentSnapshots.slice(lastAiExtractIndex);
  if (newSnapshots.length === 0) return;
  lastAiExtractIndex = contentSnapshots.length;

  const summaryTexts = newSnapshots
    .filter(s => s.summary)
    .map(s => `[${s.app}] ${s.summary}`)
    .slice(-10);

  const recentTitles = getAllActivity().slice(-15)
    .map(a => `${a.app}: "${a.title}"${a.url ? ` (${a.url})` : ''}${a.summary ? ' — ' + a.summary : ''}`)
    .join('\n');

  const clipTexts = clipboardLog.slice(-5).map(c => `Clipboard: "${c.text.slice(0, 150)}"`).join('\n');

  const input = [recentTitles, summaryTexts.join('\n'), clipTexts].filter(Boolean).join('\n\n');
  if (input.length < 30) return;

  const data = await claudeRequest({
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
    for (const e of entities) {
      if (!e.label || !e.type) continue;
      addEntity(e.label, e.type, 'ai-extract', contextHint);
      if (e.confidence === 'high') {
        const id = `${e.type}:${normalizeEntity(e.label)}`;
        const node = entityNodes.get(id);
        if (node) node.verified = true;
      }
    }
    if (entities.length > 0) {
      console.log(`[Enk] AI extracted: ${entities.map(e => e.label).join(', ')}`);
    }
  } catch {}
}

// Nia-based edge building: entities that co-occur in Nia search results get connected
async function buildNiaEdges(): Promise<void> {
  if (!store?.get('niaKey')) return;
  nia.setApiKey(store.get('niaKey') as string);

  const topEntities = Array.from(entityNodes.values())
    .filter(n => n.type !== 'app')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 25);

  if (topEntities.length < 2) return;

  const contextToEntities: Map<string, Set<string>> = new Map();

  for (const node of topEntities) {
    try {
      const results = await withTimeout(nia.semanticSearch(node.label, { limit: 5 }), 3000);
      if (!results || results.length === 0) continue;
      for (const ctx of results) {
        const ctxId = ctx.id || ctx.title || JSON.stringify(ctx).slice(0, 50);
        if (!contextToEntities.has(ctxId)) contextToEntities.set(ctxId, new Set());
        contextToEntities.get(ctxId)!.add(node.id);
      }
      await new Promise(r => setTimeout(r, 200)); // rate limit
    } catch {}
  }

  let added = 0;
  for (const [, entityIds] of contextToEntities) {
    const ids = Array.from(entityIds);
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        const edgeKey = `${a}↔${b}`;
        const existing = entityEdges.get(edgeKey);
        if (existing) {
          existing.weight++;
        } else {
          entityEdges.set(edgeKey, { source: a, target: b, weight: 1 });
          added++;
        }
      }
    }
  }
  if (added > 0) {
    console.log(`[Enk] Nia edges: added ${added} context-based connections`);
    saveGraphToStore();
  }
}

// AI-powered graph cleanup -- prunes noise, merges duplicates
async function cleanupGraph(): Promise<void> {
  if (!store?.get('anthropicKey')) return;

  const unverified = Array.from(entityNodes.values())
    .filter(n => !n.verified && n.type !== 'app')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 60);

  if (unverified.length === 0) return;

  const entityList = unverified.map(n =>
    `${n.id} | "${n.label}" | ${n.type} | weight:${n.weight} | contexts:[${n.contexts.join(',')}]`
  ).join('\n');

  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    system: `You classify entities from a personal computer activity graph as signal or noise.

SIGNAL = personally meaningful to the user: real people, specific topics of interest, projects, specific content (videos/articles), real places.
NOISE = UI artifacts, generic words, system processes, navigation elements, partial words, single letters, common words that aren't topics.

Return JSON: {"keep": ["entity_id", ...], "remove": ["entity_id", ...], "merge": [{"into": "entity_id", "from": ["entity_id", ...]}, ...]}

For merge: combine duplicate/similar entities (e.g. "Japan" and "japan travel" → keep the more descriptive one).
Be aggressive about removing noise. When in doubt, remove.`,
    messages: [{ role: 'user', content: entityList }],
  });

  if (!data) return;
  const text = data.content?.[0]?.text;
  if (!text) return;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  try {
    const result: { keep?: string[]; remove?: string[]; merge?: { into: string; from: string[] }[] } = JSON.parse(jsonMatch[0]);
    let removed = 0;
    let merged = 0;

    if (result.remove) {
      for (const id of result.remove) {
        if (entityNodes.has(id)) {
          entityNodes.delete(id);
          removed++;
        }
      }
    }

    if (result.keep) {
      for (const id of result.keep) {
        const node = entityNodes.get(id);
        if (node) node.verified = true;
      }
    }

    if (result.merge) {
      for (const m of result.merge) {
        const target = entityNodes.get(m.into);
        if (!target) continue;
        for (const fromId of m.from) {
          const src = entityNodes.get(fromId);
          if (src) {
            target.weight += src.weight;
            for (const ctx of src.contexts) {
              if (!target.contexts.includes(ctx)) target.contexts.push(ctx);
            }
            if (src.firstSeen < target.firstSeen) target.firstSeen = src.firstSeen;
            if (src.lastSeen > target.lastSeen) target.lastSeen = src.lastSeen;
            entityNodes.delete(fromId);
            merged++;
          }
        }
        target.verified = true;
      }
    }

    // Clean orphaned edges
    for (const [key, edge] of entityEdges) {
      if (!entityNodes.has(edge.source) || !entityNodes.has(edge.target)) {
        entityEdges.delete(key);
      }
    }

    if (removed > 0 || merged > 0) {
      console.log(`[Enk] Graph cleanup: removed ${removed}, merged ${merged}. ${entityNodes.size} entities remain.`);
      saveGraphToStore();
    }
  } catch (err: any) {
    console.error('[Enk] Graph cleanup parse error:', err.message);
  }
}

function getNodeContext(nodeId: string, nodeLabel: string) {
  const lbl = nodeLabel.toLowerCase();
  const relatedActivity = getAllActivity()
    .filter(e => e.app.toLowerCase().includes(lbl) || e.title.toLowerCase().includes(lbl) || (e.url && e.url.toLowerCase().includes(lbl)) || (e.summary && e.summary.toLowerCase().includes(lbl)))
    .slice(-8)
    .map(e => ({
      app: e.app, title: e.title, url: e.url, start: e.start, end: e.end,
      duration: e.duration, summary: e.summary,
    }));

  const relatedContent = getAllSnapshots()
    .filter(s => s.app.toLowerCase().includes(lbl) || s.title.toLowerCase().includes(lbl) || s.text.toLowerCase().includes(lbl) || (s.summary && s.summary.toLowerCase().includes(lbl)))
    .slice(-5)
    .map(s => ({
      timestamp: s.timestamp, app: s.app, title: s.title, summary: s.summary,
      textPreview: s.text.slice(0, 200),
    }));

  const relatedClipboard = clipboardLog
    .filter(c => c.text.toLowerCase().includes(lbl))
    .slice(-5)
    .map(c => ({ text: c.text.slice(0, 150), timestamp: c.timestamp, app: c.app }));

  const relatedMusic = nowPlayingLog
    .filter(n => n.track.toLowerCase().includes(lbl) || n.artist.toLowerCase().includes(lbl))
    .slice(-5);

  return { relatedActivity, relatedContent, relatedClipboard, relatedMusic };
}

function getGraphData(includeContext = false) {
  // Score entities: verified + multi-context entities rank highest
  const nodes = Array.from(entityNodes.values())
    .map(n => ({ ...n, _score: n.weight * (n.verified ? 3 : 1) * Math.max(1, n.contexts.length) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 80);
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = Array.from(entityEdges.values())
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 200);

  const enrichedNodes = nodes.map(n => {
    const base = { ...n, mentions: n.weight, contextDiversity: n.contexts?.length || 1, verified: n.verified || false };
    if (includeContext) {
      return { ...base, context: getNodeContext(n.id, n.label) };
    }
    return base;
  });

  const enrichedEdges = edges.map(e => {
    const srcNode = entityNodes.get(e.source);
    const tgtNode = entityNodes.get(e.target);
    return {
      ...e,
      sourceLabel: srcNode?.label || e.source,
      targetLabel: tgtNode?.label || e.target,
      sourceType: srcNode?.type || 'topic',
      targetType: tgtNode?.type || 'topic',
    };
  });

  return { nodes: enrichedNodes, edges: enrichedEdges };
}

function getNodeDetailData(nodeId: string) {
  const node = entityNodes.get(nodeId);
  if (!node) return null;
  const context = getNodeContext(nodeId, node.label);
  const connectedEdges = Array.from(entityEdges.values())
    .filter(e => e.source === nodeId || e.target === nodeId)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 20);
  const connections = connectedEdges.map(e => {
    const otherId = e.source === nodeId ? e.target : e.source;
    const other = entityNodes.get(otherId);
    return { id: otherId, label: other?.label || otherId, type: other?.type || 'topic', coOccurrences: e.weight };
  });
  return { ...node, mentions: node.weight, context, connections };
}

function getEdgeDetailData(sourceId: string, targetId: string) {
  const edgeKey = [sourceId, targetId].sort().join('↔');
  const edge = entityEdges.get(edgeKey);
  if (!edge) return null;
  const srcNode = entityNodes.get(sourceId);
  const tgtNode = entityNodes.get(targetId);
  const srcLabel = srcNode?.label?.toLowerCase() || '';
  const tgtLabel = tgtNode?.label?.toLowerCase() || '';

  const sharedActivity = getAllActivity()
    .filter(e => {
      const haystack = `${e.app} ${e.title} ${e.url || ''} ${e.summary || ''}`.toLowerCase();
      return haystack.includes(srcLabel) || haystack.includes(tgtLabel);
    })
    .slice(-8)
    .map(e => ({ app: e.app, title: e.title, url: e.url, start: e.start, duration: e.duration, summary: e.summary }));

  return {
    source: { id: sourceId, label: srcNode?.label, type: srcNode?.type },
    target: { id: targetId, label: tgtNode?.label, type: tgtNode?.type },
    weight: edge.weight,
    sharedActivity,
  };
}

// ─── Clipboard Monitoring ───────────────────────────────────────
let lastClipboardText = '';
let clipboardTimer: ReturnType<typeof setInterval> | null = null;
const clipboardLog: { text: string; timestamp: number; app: string }[] = [];

function pollClipboard(): void {
  try {
    const text = clipboard.readText().trim();
    if (!text || text === lastClipboardText || text.length > 2000 || text.length < 2) return;
    lastClipboardText = text;
    clipboardLog.push({ text: text.slice(0, 500), timestamp: Date.now(), app: currentWindow.app });
    // Extract entities from clipboard content
    if (text.length > 2 && text.length < 200) {
      addEntity(text.slice(0, 80), 'topic');
    }
    // Check for URLs
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      try {
        const domain = new URL(urlMatch[0]).hostname.replace(/^www\./, '');
        addEntity(domain, 'content');
      } catch {}
    }
  } catch {}
}

// ─── Now Playing (macOS) ────────────────────────────────────────
let nowPlayingTimer: ReturnType<typeof setInterval> | null = null;
let lastNowPlaying = '';
const nowPlayingLog: { track: string; artist: string; app: string; timestamp: number }[] = [];

function pollNowPlaying(): void {
  const script = `
    try
      tell application "System Events"
        set musicApps to {"Spotify", "Music", "Apple Music"}
        repeat with appName in musicApps
          if (exists (processes whose name is appName)) then
            tell application appName
              if player state is playing then
                return (name of current track) & "|||" & (artist of current track) & "|||" & appName
              end if
            end tell
          end if
        end repeat
      end tell
    end try
    return ""
  `;
  exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 3000 }, (err, stdout) => {
    if (err || !stdout.trim()) return;
    const parts = stdout.trim().split('|||');
    if (parts.length < 3) return;
    const [track, artist, musicApp] = parts.map(p => p.trim());
    const key = `${track} - ${artist}`;
    if (key === lastNowPlaying) return;
    lastNowPlaying = key;
    nowPlayingLog.push({ track, artist, app: musicApp, timestamp: Date.now() });
    if (track) addEntity(track, 'content');
    if (artist) addEntity(artist, 'person');
    console.log(`[Enk] Now playing: "${track}" by ${artist} (${musicApp})`);
  });
}

// ─── Store (ESM-safe dynamic import) ────────────────────────────
let store: any;

async function initStore(): Promise<void> {
  const { default: Store } = await import('electron-store');
  store = new Store({
    name: 'enk-config',
    schema: {
      anthropicKey: { type: 'string', default: '' },
      niaKey: { type: 'string', default: '' },
      enabled: { type: 'boolean', default: true },
      scamDetection: { type: 'boolean', default: true },
      firstLaunch: { type: 'boolean', default: true },
    },
    encryptionKey: 'enk-secure-storage-key-v1'
  });
}

// ─── Globals ────────────────────────────────────────────────────
let chatWindow: BrowserWindow | null = null;
let indicatorWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tesseractWorker: any = null;

const nia = new NiaClient('');

let windowPollTimer: ReturnType<typeof setInterval> | null = null;
let captureTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let patternTimer: ReturnType<typeof setInterval> | null = null;
let summaryTimer: ReturnType<typeof setInterval> | null = null;
let isAnalyzing = false;

// ─── Local Knowledge Cache ──────────────────────────────────────
// Instead of querying Nia on every chat, maintain a local knowledge
// string that accumulates everything Enk knows. Fed directly to Claude.
let cachedSoul = '';
let cachedUserProfile = '';
let localKnowledge = '';          // accumulated user facts, interests, goals
let knowledgeLastConsolidated = 0;
const CONSOLIDATION_INTERVAL_MS = 30 * 60 * 1000; // consolidate every 30 min
const MAX_KNOWLEDGE_LENGTH = 8000;

async function initLocalKnowledge(): Promise<void> {
  if (!store?.get('niaKey')) return;
  nia.setApiKey(store.get('niaKey') as string);

  try {
    const results = await withTimeout(
      Promise.allSettled([
        nia.semanticSearch('soul identity rules', { tags: 'soul', limit: 1 }),
        nia.semanticSearch('user profile preferences', { tags: 'user-profile', limit: 1 }),
        nia.listContexts({ tags: 'user-fact', limit: 50 }),
        nia.listContexts({ tags: 'pattern', limit: 10 }),
      ]),
      10000
    );
    if (!results) {
      console.warn('[Enk] initLocalKnowledge timed out');
      return;
    }

    if (results[0].status === 'fulfilled' && results[0].value?.length > 0) {
      cachedSoul = results[0].value[0].content || results[0].value[0].summary || '';
    }
    if (results[1].status === 'fulfilled' && results[1].value?.length > 0) {
      cachedUserProfile = results[1].value[0].content || results[1].value[0].summary || '';
    }

    const factEntries: string[] = [];
    if (results[2].status === 'fulfilled' && results[2].value?.length > 0) {
      for (const ctx of results[2].value) {
        const fact = ctx.summary || ctx.content || '';
        if (fact) factEntries.push(`- ${fact}`);
      }
    }
    if (results[3].status === 'fulfilled' && results[3].value?.length > 0) {
      for (const ctx of results[3].value) {
        const pattern = ctx.summary || ctx.content || '';
        if (pattern) factEntries.push(`- [Pattern] ${pattern}`);
      }
    }

    if (factEntries.length > 0) {
      localKnowledge = factEntries.join('\n');
    }

    knowledgeLastConsolidated = Date.now();
    console.log(`[Enk] Local knowledge initialized: soul=${cachedSoul.length}ch, user=${cachedUserProfile.length}ch, facts=${factEntries.length}`);
  } catch (e: any) {
    console.error('[Enk] Knowledge init failed:', e.message);
  }
}

function appendKnowledge(facts: string[]): void {
  for (const fact of facts) {
    localKnowledge += `\n- ${fact}`;
  }
  if (localKnowledge.length > MAX_KNOWLEDGE_LENGTH) {
    scheduleConsolidation();
  }
}

let consolidationPending = false;
function scheduleConsolidation(): void {
  if (consolidationPending) return;
  consolidationPending = true;
  setTimeout(() => consolidateKnowledge().finally(() => { consolidationPending = false; }), 5000);
}

async function consolidateKnowledge(): Promise<void> {
  if (!store?.get('anthropicKey') || localKnowledge.length < 500) return;

  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    system: `You maintain a user knowledge file. Given raw accumulated facts (some may be duplicates or outdated), produce a clean, consolidated version. Group by category (interests, goals, relationships, projects, preferences, habits). Remove duplicates. Merge related facts into richer entries. Keep it concise but specific. Output only the consolidated text, no preamble.`,
    messages: [{ role: 'user', content: `Consolidate this knowledge:\n\n${localKnowledge}` }]
  });

  if (!data) return;
  const text = data.content?.[0]?.text;
  if (text && text.length > 50) {
    localKnowledge = text;
    knowledgeLastConsolidated = Date.now();
    console.log(`[Enk] Knowledge consolidated: ${localKnowledge.length}ch`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// ─── Tier 1: Window Tracking State ──────────────────────────────
let currentWindow: { app: string; title: string; url: string | null; since: number } = {
  app: '', title: '', url: '', since: Date.now()
};
const activityLog: ActivityEntry[] = [];
let loadedActivity: ActivityEntry[] = [];   // from previous sessions (persisted)
const MIN_DURATION_MS = 3000;
const PERSISTED_ACTIVITY_MAX = 150;

function getAllActivity(): ActivityEntry[] {
  return [...loadedActivity, ...activityLog].sort((a, b) => a.start - b.start);
}

function getAllSnapshots(): ContentSnapshot[] {
  return [...loadedSnapshots, ...contentSnapshots].sort((a, b) => a.timestamp - b.timestamp);
}

const BROWSER_APPS: Record<string, string> = {
  'google chrome': 'Google Chrome',
  'safari': 'Safari',
  'firefox': 'Firefox',
  'brave browser': 'Brave Browser',
  'arc': 'Arc',
  'microsoft edge': 'Microsoft Edge',
  'opera': 'Opera',
  'vivaldi': 'Vivaldi',
  'chromium': 'Chromium',
};

function getActiveWindow(): Promise<WindowInfo> {
  return new Promise((resolve) => {
    const script = `
      tell application "System Events"
        set frontProc to first application process whose frontmost is true
        set appName to name of frontProc
        set winTitle to ""
        try
          set winTitle to name of first window of frontProc
        end try
      end tell
      return appName & "|||" & winTitle
    `;
    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err, stdout) => {
      if (err) {
        resolve({ app: 'Unknown', title: '', url: null });
        return;
      }
      const parts = stdout.trim().split('|||');
      resolve({ app: (parts[0] || '').trim(), title: (parts[1] || '').trim(), url: null });
    });
  });
}

function getBrowserInfo(appName: string): Promise<BrowserInfo> {
  const normalized = appName.toLowerCase();
  const browserName = BROWSER_APPS[normalized];
  if (!browserName) return Promise.resolve({ url: null, tabTitle: null });

  return new Promise((resolve) => {
    let script: string;
    if (normalized === 'safari') {
      script = `tell application "Safari"\nset t to current tab of front window\nreturn (URL of t) & "|||" & (name of t)\nend tell`;
    } else if (normalized === 'arc') {
      script = `tell application "Arc"\nset t to active tab of front window\nreturn (URL of t) & "|||" & (title of t)\nend tell`;
    } else {
      script = `tell application "${browserName}"\nset t to active tab of front window\nreturn (URL of t) & "|||" & (title of t)\nend tell`;
    }
    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 2000 }, (err, stdout) => {
      if (err) { resolve({ url: null, tabTitle: null }); return; }
      const parts = stdout.trim().split('|||');
      resolve({ url: (parts[0] || '').trim() || null, tabTitle: (parts[1] || '').trim() || null });
    });
  });
}

async function pollActiveWindow(): Promise<void> {
  try {
    const win = await getActiveWindow();
    const browser = await getBrowserInfo(win.app);
    if (browser.tabTitle) win.title = browser.tabTitle;
    win.url = browser.url;

    const appOrTitleChanged = win.app !== currentWindow.app || win.title !== currentWindow.title;
    const urlChanged = !!browser.url && browser.url !== currentWindow.url &&
      stripUrlFragment(browser.url) !== stripUrlFragment(currentWindow.url);
    const changed = appOrTitleChanged || urlChanged;

    if (changed) {
      const now = Date.now();
      const duration = now - currentWindow.since;

      if (duration >= MIN_DURATION_MS && currentWindow.app) {
        const recentSummary = contentSnapshots
          .filter(s => s.timestamp >= currentWindow.since && s.summary)
          .map(s => s.summary)
          .pop() || null;

        activityLog.push({
          app: currentWindow.app,
          title: currentWindow.title,
          url: currentWindow.url,
          start: currentWindow.since,
          end: now,
          duration,
          summary: recentSummary,
        });
      }

      currentWindow = { app: win.app, title: win.title, url: win.url, since: now };

      // Extract entities from the new window/tab
      extractEntitiesFromActivity(win.app, win.title, win.url, null);
    }
  } catch {
    // Silently skip
  }
}

function stripUrlFragment(url: string | null): string {
  if (!url) return '';
  try { return url.split('#')[0].split('?')[0].replace(/\/+$/, ''); }
  catch { return url; }
}

// ─── Tier 2: Screen Capture + OCR State ─────────────────────────
const previousScreens: Record<string, Buffer> = {};
const previousTexts: Record<string, string> = {};
let activeThreat = false;

const contentSnapshots: ContentSnapshot[] = [];
let loadedSnapshots: ContentSnapshot[] = [];  // from previous sessions (persisted)
const PERSISTED_SNAPSHOTS_MAX = 40;
const pendingSummaries: ContentSnapshot[] = [];

function extractNewContent(prevText: string, newText: string): string {
  if (!prevText) return newText;
  const prevLines = new Set(prevText.split('\n').map(l => l.trim()).filter(Boolean));
  const newLines = newText.split('\n').map(l => l.trim()).filter(Boolean);
  const diff = newLines.filter(line => !prevLines.has(line));
  return diff.length > 0 ? diff.join('\n') : newText.slice(0, 500);
}

async function generateSummaries(): Promise<void> {
  if (pendingSummaries.length === 0) return;
  if (!store.get('anthropicKey')) return;

  const batch = pendingSummaries.splice(0, 5);
  const entries = batch.map((s, i) => {
    return `${i + 1}. App: ${s.app}, Tab: "${s.title}", URL: ${s.url || 'none'}\n   Content: ${s.text.slice(0, 200).replace(/\n/g, ' ')}`;
  }).join('\n');

  try {
    const data = await claudeRequest({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: `Generate a short 5-10 word human-readable summary for each activity entry. Output JSON array of strings.

CRITICAL: ONLY state what you can directly see in the App, Tab, URL, and Content. Do NOT infer message content, email subject, or conversation topic.
- If you only see "Messages - Benjamin Xu", say "Messages with Benjamin Xu" or "opened Messages to Benjamin Xu"—never guess what was discussed.
- For chat apps: describe only that the app was open to that contact. Do not invent the conversation topic.
- Be specific using the content/title when available. Examples: "watched Dave Ramsey budgeting video" (when title shows that), "searched for cafes on Google Maps" (when URL shows maps), "edited main.js in VS Code" (when title shows file).`,
      messages: [{ role: 'user', content: entries }]
    });
    if (!data) return;
    const text = data.content?.[0]?.text;
    if (!text) return;
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;
    const summaries: string[] = JSON.parse(match[0]);
    batch.forEach((s, i) => {
      if (summaries[i]) {
        s.summary = summaries[i];
        extractEntitiesFromActivity(s.app, s.title, s.url, summaries[i]);
      }
    });
  } catch (e: any) {
    console.error('[Enk] Summary generation failed:', e.message);
  }
}

function scrubSensitiveData(text: string): string {
  let scrubbed = text.replace(/\b(\d[ -]?){13,19}\b/g, '[CARD REDACTED]');
  scrubbed = scrubbed.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]');
  scrubbed = scrubbed.replace(/(password|passwd|pwd|passcode)\s*[:=]?\s*\S+/gi, '$1: [REDACTED]');
  scrubbed = scrubbed.replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, '[API KEY REDACTED]');
  scrubbed = scrubbed.replace(/(secret|token|key)\s*[:=]?\s*\S+/gi, '$1: [REDACTED]');
  return scrubbed;
}

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = a.replace(/\s+/g, ' ').trim();
  const nb = b.replace(/\s+/g, ' ').trim();
  if (na === nb) return 1;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  if (longer.length === 0) return 1;
  let matches = 0;
  let searchStart = 0;
  for (let i = 0; i < shorter.length; i++) {
    const idx = longer.indexOf(shorter[i], searchStart);
    if (idx !== -1) { matches++; searchStart = idx + 1; }
  }
  return matches / longer.length;
}

function hasScreenChanged(screenId: string, nativeImage: NativeImage): boolean {
  const bmp = nativeImage.toBitmap();
  const size = nativeImage.getSize();
  const totalPixels = size.width * size.height;
  const sampleCount = 500;
  const step = Math.max(1, Math.floor(totalPixels / sampleCount));
  const samples = Buffer.alloc(sampleCount * 3);

  for (let i = 0; i < sampleCount; i++) {
    const pixelIndex = i * step;
    const byteOffset = pixelIndex * 4;
    if (byteOffset + 2 < bmp.length) {
      samples[i * 3] = bmp[byteOffset];
      samples[i * 3 + 1] = bmp[byteOffset + 1];
      samples[i * 3 + 2] = bmp[byteOffset + 2];
    }
  }

  const prev = previousScreens[screenId];
  previousScreens[screenId] = samples;
  if (!prev) return true;

  let diffCount = 0;
  for (let i = 0; i < sampleCount * 3; i += 3) {
    const dr = Math.abs(samples[i] - prev[i]);
    const dg = Math.abs(samples[i + 1] - prev[i + 1]);
    const db = Math.abs(samples[i + 2] - prev[i + 2]);
    if (dr + dg + db > 30) diffCount++;
  }
  return (diffCount / sampleCount) * 100 > 25;
}

async function initTesseract(): Promise<void> {
  const Tesseract = require('tesseract.js');
  tesseractWorker = await Tesseract.createWorker('eng');
  await tesseractWorker.setParameters({
    tessedit_pageseg_mode: '3',  // fully automatic page segmentation
    preserve_interword_spaces: '1',
  });
  console.log('[Enk] Tesseract worker initialized (PSM 3, preserve spaces)');
}

async function runOCR(pngBuffer: Buffer): Promise<OcrResult> {
  if (!tesseractWorker) await initTesseract();
  const result = await tesseractWorker.recognize(pngBuffer);
  return { text: result.data.text, confidence: result.data.confidence };
}

async function captureAllScreens(): Promise<ScreenCapture[]> {
  try {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    });
    return sources
      .filter(s => s.thumbnail && !s.thumbnail.isEmpty())
      .map(s => ({ id: s.id, name: s.name, nativeImage: s.thumbnail }));
  } catch (err: any) {
    console.error('[Enk] Screen capture failed:', err.message);
    return [];
  }
}

// ─── Claude API ─────────────────────────────────────────────────
const SCAM_SYSTEM_PROMPT = `You are a scam detection system analyzing text extracted from a user's screen. Determine if anything dangerous is happening. Flag: remote access software (AnyDesk, TeamViewer, UltraViewer), fake support interfaces, gift card/wire/crypto payment requests, urgent virus/account warnings, fake login pages, unusual pop-ups demanding action. Respond in JSON: {"flagged": true/false, "risk_level": "low/medium/high", "reason": "brief explanation"}`;

function claudeRequest(body: ClaudeRequestBody): Promise<ClaudeResponse | null> {
  return new Promise((resolve) => {
    const apiKey = store.get('anthropicKey') as string;
    if (!apiKey) { resolve(null); return; }

    const request = net.request({ method: 'POST', url: 'https://api.anthropic.com/v1/messages' });
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('x-api-key', apiKey);
    request.setHeader('anthropic-version', '2023-06-01');

    let responseData = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { responseData += chunk.toString(); });
      response.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          if (data.error) { console.error('[Enk] Claude error:', data.error); resolve(null); return; }
          resolve(data);
        } catch (e: any) {
          console.error('[Enk] Claude parse error:', e.message);
          resolve(null);
        }
      });
    });
    request.on('error', (err: Error) => { console.error('[Enk] Claude request error:', err.message); resolve(null); });
    request.write(JSON.stringify(body));
    request.end();
  });
}

async function analyzeForScam(scrubbedText: string, base64Screenshot: string, lowConfidence: boolean): Promise<ScamResult | null> {
  const content: any[] = [];
  if (lowConfidence && base64Screenshot) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Screenshot } });
    content.push({ type: 'text', text: 'Analyze this screenshot for scams. OCR was low confidence. Extracted text: ' + (scrubbedText || '(none)') });
  } else {
    content.push({ type: 'text', text: 'Analyze for scams or dangerous activity:\n\n' + scrubbedText });
  }

  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    system: SCAM_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }]
  });
  if (!data) return null;
  const text = data.content?.[0]?.text;
  if (!text) return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

// ─── Tier 2: Main capture loop ──────────────────────────────────
function updateStatus(status: string): void {
  if (indicatorWindow && !indicatorWindow.isDestroyed()) {
    indicatorWindow.webContents.send('status-update', status);
  }
}

async function captureLoop(): Promise<void> {
  if (!store.get('enabled')) { updateStatus('inactive'); return; }
  if (isAnalyzing) return;
  isAnalyzing = true;

  try {
    const screens = await captureAllScreens();
    if (screens.length === 0) { isAnalyzing = false; return; }

    const changedScreens = screens.filter(s => hasScreenChanged(s.id, s.nativeImage));
    if (changedScreens.length === 0) { isAnalyzing = false; return; }

    updateStatus('processing');

    let threatFound = false;
    for (const sc of changedScreens) {
      const pngBuffer = sc.nativeImage.toPNG();
      if (!pngBuffer || pngBuffer.length < 100) {
        console.log(`[Enk] Skipping "${sc.name}" — empty screenshot (screen recording permission needed)`);
        continue;
      }
      console.log(`[Enk] Screenshot captured: "${sc.name}" (${pngBuffer.length} bytes)`);
      const ocr = await runOCR(pngBuffer);
      const lowConfidence = ocr.confidence < 70;
      const scrubbedText = scrubSensitiveData(ocr.text);
      console.log(`[Enk] OCR: confidence=${ocr.confidence.toFixed(1)}%, text=${scrubbedText.trim().slice(0, 80).replace(/\n/g, ' ')}...`);

      if (!lowConfidence && scrubbedText.trim().length < 20) continue;

      // Store content diff for Nia flush
      if (scrubbedText.trim().length >= 20) {
        const prevText = previousTexts[sc.id] || '';
        const similarity = textSimilarity(scrubbedText, prevText);
        if (similarity < 0.70) {
          const diffText = extractNewContent(prevText, scrubbedText.trim());
          const snapshot: ContentSnapshot = {
            timestamp: Date.now(),
            app: currentWindow.app,
            title: currentWindow.title,
            url: currentWindow.url,
            text: diffText.slice(0, 2000),
            fullText: scrubbedText.trim().slice(0, 500),
            summary: null,
          };
          contentSnapshots.push(snapshot);
          pendingSummaries.push(snapshot);
          previousTexts[sc.id] = scrubbedText;
        }
      }

      // Scam detection
      if (store.get('scamDetection') && store.get('anthropicKey')) {
        const prevScamText = previousTexts[`scam_${sc.id}`];
        const similarity = textSimilarity(scrubbedText, prevScamText);

        if (similarity > 0.85 && activeThreat) { threatFound = true; continue; }
        if (similarity > 0.85) continue;
        previousTexts[`scam_${sc.id}`] = scrubbedText;

        const base64Data = pngBuffer.toString('base64');
        const result = await analyzeForScam(scrubbedText, base64Data, lowConfidence);
        if (result && result.flagged) {
          threatFound = true;
          showScamAlert(result);
        }
      }
    }

    if (threatFound) {
      activeThreat = true;
      updateStatus('threat');
    } else {
      if (activeThreat) dismissAlert();
      activeThreat = false;
      updateStatus('active');
    }
  } catch (err: any) {
    console.error('[Enk] Capture loop error:', err);
    updateStatus('active');
  }
  isAnalyzing = false;
}

function showScamAlert(data: ScamResult): void {
  if (Notification.isSupported()) {
    new Notification({ title: 'Possible Scam Detected', body: data.reason, urgency: 'critical' }).show();
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('show-alert', data);
    overlayWindow.showInactive();
  }
}

function dismissAlert(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('hide-alert');
  }
}

// ─── Tier 3: Hourly Flush to Nia ────────────────────────────────
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function flushToNia(): Promise<void> {
  if (!store.get('niaKey')) return;
  nia.setApiKey(store.get('niaKey') as string);

  const now = Date.now();
  if (currentWindow.app && (now - currentWindow.since) >= MIN_DURATION_MS) {
    activityLog.push({
      app: currentWindow.app,
      title: currentWindow.title,
      url: currentWindow.url,
      start: currentWindow.since,
      end: now,
      duration: now - currentWindow.since,
      summary: null,
    });
    currentWindow.since = now;
  }

  if (activityLog.length === 0 && contentSnapshots.length === 0) return;

  const date = formatDate(now);
  const hour = new Date(now).getHours();

  const activityLines = activityLog.map(e => {
    const dur = Math.round(e.duration / 1000);
    const durStr = dur >= 60 ? `${Math.round(dur / 60)}min` : `${dur}s`;
    const urlStr = e.url ? ` (${e.url})` : '';
    const summaryStr = e.summary ? ` — ${e.summary}` : '';
    return `${formatTime(e.start)}-${formatTime(e.end)} ${e.app} - "${e.title}"${urlStr} [${durStr}]${summaryStr}`;
  });

  const contentLines = contentSnapshots.map(s => {
    const time = formatTime(s.timestamp);
    if (s.summary) return `[${time}] ${s.summary}`;
    const excerpt = s.text.slice(0, 200).replace(/\n/g, ' ');
    return `[${time}] ${s.app} - ${s.title}: ${excerpt}`;
  });

  const appUsage: Record<string, number> = {};
  for (const e of activityLog) {
    appUsage[e.app] = (appUsage[e.app] || 0) + e.duration;
  }
  const usageSummary = Object.entries(appUsage)
    .sort(([, a], [, b]) => b - a)
    .map(([appName, ms]) => {
      const mins = Math.round(ms / 60000);
      return mins > 0 ? `${appName}: ${mins}min` : `${appName}: ${Math.round(ms / 1000)}s`;
    })
    .join(', ');

  const content = [
    `# Activity Log - ${date} Hour ${hour}:00`,
    '', '## Timeline', ...activityLines,
    '', '## Screen Content', ...contentLines,
    '', '## App Usage', usageSummary,
  ].join('\n');

  try {
    await nia.saveContext({
      title: `Activity Log - ${date} ${hour}:00`,
      summary: `Hour ${hour}: ${usageSummary}`,
      content,
      tags: ['daily-log', date, `hour-${hour}`],
      memoryType: 'episodic',
    });
    console.log(`[Enk] Flushed activity to Nia: ${date} hour ${hour} (${activityLog.length} switches, ${contentSnapshots.length} snapshots)`);
  } catch (err: any) {
    console.error('[Enk] Failed to flush to Nia:', err.message);
  }

  // Intent extraction: promote interests/goals/plans to permanent facts
  if (store.get('anthropicKey') && content.length > 100) {
    extractIntents(content, date).catch(e => console.error('[Enk] Intent extraction failed:', e.message));
  }

  // Persist before clearing so we remember across restarts
  const combinedActivity = [...loadedActivity, ...activityLog].sort((a, b) => a.start - b.start).slice(-PERSISTED_ACTIVITY_MAX);
  const combinedSnapshots = [...loadedSnapshots, ...contentSnapshots].sort((a, b) => a.timestamp - b.timestamp).slice(-PERSISTED_SNAPSHOTS_MAX);
  try {
    store?.set('persistedActivity', combinedActivity);
    store?.set('persistedSnapshots', combinedSnapshots.map(s => ({
      timestamp: s.timestamp, app: s.app, title: s.title, url: s.url,
      text: s.text.slice(0, 400), fullText: '', summary: s.summary,
    })));
  } catch {}

  loadedActivity = combinedActivity;
  loadedSnapshots = combinedSnapshots;
  activityLog.length = 0;
  contentSnapshots.length = 0;
}

async function extractIntents(activityContent: string, date: string): Promise<void> {
  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    system: `You analyze a user's computer activity to extract personal facts about them. Output a JSON array of strings. Each string should be a concrete, specific fact about the user — interests, goals, plans, relationships, preferences, projects, or things they care about.

Rules:
- Only include facts you can confidently infer from the activity (not guesses)
- Be specific: "wants to visit Japan this summer" not "interested in travel"
- Include people they interact with: "texted Ben about Japan trip"
- Include projects: "building an Electron app called Enk"
- Include interests: "follows @433 football account on Instagram"
- Skip generic facts like "uses a computer" or "browses the web"
- Return empty array [] if nothing noteworthy
- Max 5 facts per flush`,
    messages: [{ role: 'user', content: `Extract personal facts from this activity:\n\n${activityContent.slice(0, 3000)}` }]
  });

  if (!data) return;
  const text = data.content?.[0]?.text;
  if (!text) return;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return;

  const facts: string[] = JSON.parse(match[0]);
  if (!Array.isArray(facts) || facts.length === 0) return;

  for (const fact of facts) {
    try {
      await nia.saveContext({
        title: `User Fact - ${date}`,
        summary: fact,
        content: fact,
        tags: ['user-fact', 'auto-extracted', date],
        memoryType: 'fact',
      });
    } catch (e: any) {
      console.error('[Enk] Failed to save fact:', e.message);
    }
  }
  appendKnowledge(facts);
  console.log(`[Enk] Extracted ${facts.length} user facts: ${facts.join('; ')}`);
}

// ─── Soul & User Initialization ─────────────────────────────────
const DEFAULT_SOUL = `# SOUL.md - Who You Are

You are Enk, a personal memory assistant. You observe the user's computer activity and help them recall, understand, and optimize how they spend their time.

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip filler words. Just help.

**Have opinions.** You can notice patterns, suggest improvements, and point out habits -- good or bad.

**Be resourceful.** Search memories before asking. Come back with answers, not questions.

**Respect privacy.** You have access to someone's screen activity. Treat it with care. Never share, never judge inappropriately.

## Capabilities

- Recall what the user did on any given day or time range
- Find specific things they saw, read, or worked on
- Track time spent per app and identify usage patterns
- Detect recurring behaviors and suggest templates or improvements
- Answer questions about their computer activity history

## Vibe

Concise when the user wants a quick answer. Thorough when they want analysis. Direct, not corporate. Helpful, not sycophantic.`;

const DEFAULT_USER = `# USER.md - About Your Human

- **Name:** (not yet known)
- **Timezone:** (auto-detected)
- **Notes:** New user. Learning preferences over time.

## Context

Still learning about this user through their activity patterns.`;

async function initSoulAndUser(): Promise<void> {
  if (!store.get('niaKey')) return;
  if (!store.get('firstLaunch')) return;

  nia.setApiKey(store.get('niaKey') as string);

  try {
    const existing = await withTimeout(nia.semanticSearch('soul identity enk', { tags: 'soul', limit: 1 }), 5000) || [];
    if (existing.length === 0) {
      await nia.saveContext({
        title: 'Soul - Core Identity',
        summary: 'Enk assistant personality and behavioral rules',
        content: DEFAULT_SOUL,
        tags: ['soul', 'identity'],
        memoryType: 'procedural',
      });
      console.log('[Enk] Saved default soul to Nia');
    }

    const existingUser = await withTimeout(nia.semanticSearch('user profile preferences', { tags: 'user-profile', limit: 1 }), 5000) || [];
    if (!existingUser || existingUser.length === 0) {
      await nia.saveContext({
        title: 'User Profile',
        summary: 'User preferences and context',
        content: DEFAULT_USER,
        tags: ['user-profile'],
        memoryType: 'fact',
      });
      console.log('[Enk] Saved default user profile to Nia');
    }
  } catch (err: any) {
    console.error('[Enk] Failed to init soul/user:', err.message);
  }
}

// ─── Chat / Assistant ───────────────────────────────────────────
async function handleChatQuery(query: string): Promise<{ response?: string; error?: string }> {
  if (!store.get('anthropicKey')) return { error: 'Anthropic API key not set. Go to Settings.' };

  // Consolidate knowledge if it's been a while
  if (localKnowledge.length > 500 && Date.now() - knowledgeLastConsolidated > CONSOLIDATION_INTERVAL_MS) {
    consolidateKnowledge().catch(() => {});
  }

  // Build current session context (always instant -- local data)
  let currentSessionInfo = '';
  const allActivity = getAllActivity();
  const allSnapshots = getAllSnapshots();
  if (allActivity.length > 0 || allSnapshots.length > 0) {
    const recentActivity = allActivity.slice(-20).map(e => {
      const dur = Math.round(e.duration / 1000);
      const durStr = dur >= 60 ? `${Math.round(dur / 60)}min ${dur % 60}s` : `${dur}s`;
      const urlStr = e.url ? ` (${e.url})` : '';
      const summaryStr = e.summary ? ` — ${e.summary}` : '';
      return `${formatTime(e.start)}-${formatTime(e.end)} ${e.app} - "${e.title}"${urlStr} [${durStr}]${summaryStr}`;
    }).join('\n');

    const recentContent = allSnapshots.slice(-15).map(s => {
      const time = formatTime(s.timestamp);
      const summaryStr = s.summary ? ` | Summary: ${s.summary}` : '';
      return `[${time}] ${s.app} - "${s.title}"\n  Screen text: ${s.text.slice(0, 400).replace(/\n/g, ' ')}${summaryStr}`;
    }).join('\n');

    currentSessionInfo = `\n\n## Current Session Activity\n### Timeline\n${recentActivity || '(no activity yet)'}`;
    if (recentContent) {
      currentSessionInfo += `\n\n### Screen Content Captured (OCR)\n${recentContent}`;
    }
  }

  // Optional: fire-and-forget Nia search for historical data (5s timeout)
  let niaContext = '';
  if (store.get('niaKey')) {
    nia.setApiKey(store.get('niaKey') as string);
    const niaResults = await withTimeout(nia.semanticSearch(query, { limit: 5 }), 5000);
    if (niaResults && niaResults.length > 0) {
      niaContext = niaResults.map((r: NiaContext, i: number) => {
        return `[${i + 1}] ${r.title || 'Untitled'}\n${(r.content || r.summary || '').slice(0, 400)}`;
      }).join('\n\n');
    }
  }

  const knowledgeSection = localKnowledge
    ? `\n\n## What I Know About You\n${localKnowledge}`
    : '';

  const niaSection = niaContext
    ? `\n\n## Historical Memories (from Nia)\n${niaContext}`
    : '';

  const systemPrompt = `${cachedSoul}\n\n---\n## User Profile\n${cachedUserProfile}${knowledgeSection}${niaSection}${currentSessionInfo}\n\n---\nAnswer the user's question using ALL the data above — your knowledge about them, activity timeline, screen content (OCR text), and any historical memories. Be specific: cite times, app names, URLs, contact names, and actual content you can see in the screen captures. If the screen text shows who they were talking to or what they were reading, mention it.`;

  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: query }]
  });

  if (!data) return { error: 'Failed to get response from Claude.' };
  const text = data.content?.[0]?.text;
  return { response: text || 'No response generated.' };
}

// ─── Pattern Detection ──────────────────────────────────────────
let lastPatternDate = '';

async function detectPatterns(): Promise<void> {
  if (!store.get('anthropicKey') || !store.get('niaKey')) return;
  nia.setApiKey(store.get('niaKey') as string);

  const today = formatDate(Date.now());
  if (lastPatternDate === today) return; // once per day max

  try {
    const recentLogs = await nia.semanticSearch('daily activity log', { tags: 'daily-log', limit: 20 });
    if (!recentLogs || recentLogs.length < 3) return;

    const logsText = recentLogs.map((r: NiaContext) => {
      return `### ${r.title}\n${(r.content || r.summary || '').slice(0, 800)}`;
    }).join('\n\n');

    const existingKnowledge = localKnowledge || '(none yet)';

    const data = await claudeRequest({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: `You analyze computer activity logs to build a profile of who this person is. Focus on WHAT they care about, not HOW they use their computer.

DO extract:
- Specific content consumed (video titles, articles, topics)
- People they interact with and the nature of those relationships
- Projects they're working on and their current status
- Recurring interests and hobbies (specific: "watches La Liga football" not "watches videos")
- Goals or plans mentioned or implied
- Apps/tools they rely on for specific tasks

DO NOT extract:
- Generic computer behavior ("switches between apps", "uses browser")
- Observations about app switching, tab management, or workflow
- Anything already known (see existing knowledge below)

Output JSON array: [{"insight": "specific fact about this person", "evidence": "brief supporting detail from the logs"}]. Max 8 insights. Only include things you're confident about.

## Already Known
${existingKnowledge}`,
      messages: [{ role: 'user', content: `Analyze these activity logs:\n\n${logsText}` }]
    });

    if (!data) return;
    const text = data.content?.[0]?.text;
    if (!text) return;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const insights: { insight: string; evidence?: string }[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(insights) || insights.length === 0) return;

    const patternContent = insights.map((p, i) =>
      `${i + 1}. ${p.insight}${p.evidence ? ` (${p.evidence})` : ''}`
    ).join('\n');

    await nia.saveContext({
      title: `Profile Insights - ${today}`,
      summary: insights.map(p => p.insight).join('; '),
      content: patternContent,
      tags: ['pattern', today],
      memoryType: 'fact',
    });

    appendKnowledge(insights.map(p => p.insight));
    lastPatternDate = today;
    console.log(`[Enk] Extracted ${insights.length} profile insights: ${insights.map(p => p.insight).join('; ')}`);
  } catch (err: any) {
    console.error('[Enk] Pattern detection failed:', err.message);
  }
}

// ─── Export .md ──────────────────────────────────────────────────
async function exportMarkdown(type: string, date?: string): Promise<{ content?: string; filename?: string; error?: string }> {
  if (!store.get('niaKey')) return { error: 'Nia API key not set.' };
  nia.setApiKey(store.get('niaKey') as string);

  try {
    if (type === 'soul') {
      const results = await nia.semanticSearch('soul identity', { tags: 'soul', limit: 1 });
      return { content: results?.[0]?.content || DEFAULT_SOUL, filename: 'soul.md' };
    }
    if (type === 'user') {
      const results = await nia.semanticSearch('user profile', { tags: 'user-profile', limit: 1 });
      return { content: results?.[0]?.content || DEFAULT_USER, filename: 'user.md' };
    }
    if (type === 'daily') {
      const targetDate = date || formatDate(Date.now());
      const results = await nia.semanticSearch(`activity log ${targetDate}`, { tags: `daily-log,${targetDate}`, limit: 24 });
      if (!results || results.length === 0) return { content: `# No activity data for ${targetDate}`, filename: `${targetDate}.md` };
      const combined = results.map((r: NiaContext) => r.content || r.summary || '').join('\n\n---\n\n');
      return { content: `# Activity Summary - ${targetDate}\n\n${combined}`, filename: `${targetDate}.md` };
    }
    if (type === 'patterns') {
      const results = await nia.semanticSearch('recurring patterns', { tags: 'pattern', limit: 10 });
      if (!results || results.length === 0) return { content: '# No patterns detected yet', filename: 'patterns.md' };
      const combined = results.map((r: NiaContext) => `## ${r.title}\n${r.content || r.summary || ''}`).join('\n\n');
      return { content: `# Detected Patterns\n\n${combined}`, filename: 'patterns.md' };
    }
    return { error: 'Unknown export type' };
  } catch (err: any) {
    return { error: err.message };
  }
}

// ─── Activity Stats ─────────────────────────────────────────────
function getLocalStats() {
  const appUsage: Record<string, number> = {};
  for (const e of getAllActivity()) {
    appUsage[e.app] = (appUsage[e.app] || 0) + e.duration;
  }
  if (currentWindow.app) {
    const elapsed = Date.now() - currentWindow.since;
    appUsage[currentWindow.app] = (appUsage[currentWindow.app] || 0) + elapsed;
  }

  const sorted = Object.entries(appUsage)
    .sort(([, a], [, b]) => b - a)
    .map(([appName, ms]) => ({ app: appName, minutes: Math.round(ms / 60000), seconds: Math.round(ms / 1000) }));

  const allActivity = getAllActivity();
  return {
    apps: sorted,
    totalSwitches: allActivity.length,
    recentActivity: allActivity.slice(-50).map(e => ({
      app: e.app, title: e.title, url: e.url, start: e.start, duration: e.duration, summary: e.summary,
    })),
  };
}

// ─── Monitoring Control ─────────────────────────────────────────
// ─── Fast Intent Extraction (every 5 min from local data) ───────
let fastIntentTimer: ReturnType<typeof setInterval> | null = null;

async function fastIntentExtraction(): Promise<void> {
  if (!store?.get('anthropicKey')) return;
  const recentEntries = getAllActivity().slice(-10);
  const recentSnapshots = getAllSnapshots().slice(-5);
  if (recentEntries.length === 0 && recentSnapshots.length === 0) return;

  const activityText = recentEntries.map(e => {
    const summaryStr = e.summary ? ` — ${e.summary}` : '';
    return `${e.app}: "${e.title}"${e.url ? ` (${e.url})` : ''}${summaryStr}`;
  }).join('\n');

  const contentText = recentSnapshots.map(s => {
    return `[${s.app}] ${s.summary || s.text.slice(0, 150)}`;
  }).join('\n');

  const clipText = clipboardLog.slice(-5).map(c => `Copied: "${c.text.slice(0, 100)}"`).join('\n');
  const musicText = nowPlayingLog.slice(-3).map(n => `Listening: "${n.track}" by ${n.artist}`).join('\n');

  const combined = [activityText, contentText, clipText, musicText].filter(Boolean).join('\n\n');
  if (combined.length < 50) return;

  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: `Extract specific personal facts from recent activity. Output JSON array of strings. Focus on: content consumed (specific titles/topics), people interacted with, interests shown, goals/plans implied. Skip generic facts. Max 5 facts. Return [] if nothing noteworthy.\n\nAlready known:\n${localKnowledge.slice(0, 1000) || '(nothing yet)'}`,
    messages: [{ role: 'user', content: combined }]
  });

  if (!data) return;
  const text = data.content?.[0]?.text;
  if (!text) return;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return;

  const facts: string[] = JSON.parse(match[0]);
  if (facts.length > 0) {
    appendKnowledge(facts);
    console.log(`[Enk] Fast intent: ${facts.join('; ')}`);
  }
}

// ─── Monitoring Control ─────────────────────────────────────────
function startMonitoring(): void {
  if (windowPollTimer) return;
  console.log('[Enk] Starting monitoring (Tier 1: 500ms, Tier 2: 5s, Tier 3: 1h, Intents: 5min)');

  pollActiveWindow();
  windowPollTimer = setInterval(pollActiveWindow, 500);

  updateStatus('active');
  captureLoop();
  captureTimer = setInterval(captureLoop, 5000);

  flushTimer = setInterval(flushToNia, 60 * 60 * 1000);
  patternTimer = setInterval(detectPatterns, 12 * 60 * 60 * 1000);
  summaryTimer = setInterval(generateSummaries, 15000);

  // Fast intent extraction every 5 minutes
  fastIntentTimer = setInterval(fastIntentExtraction, 5 * 60 * 1000);
  // First run after 2 minutes (let some data accumulate)
  setTimeout(fastIntentExtraction, 2 * 60 * 1000);

  // Clipboard monitoring every 1s
  pollClipboard();
  clipboardTimer = setInterval(pollClipboard, 1000);

  // Now playing every 10s
  pollNowPlaying();
  nowPlayingTimer = setInterval(pollNowPlaying, 10000);

  // Auto-save graph every 10 minutes
  graphSaveTimer = setInterval(saveGraphToStore, GRAPH_SAVE_INTERVAL_MS);

  // AI entity extraction every 2 minutes (smarter than regex)
  aiExtractTimer = setInterval(aiExtractEntities, 2 * 60 * 1000);
  setTimeout(aiExtractEntities, 90 * 1000); // first run after 90s

  // AI graph cleanup every 30 minutes + decay once at startup
  setTimeout(() => { decayGraph(); cleanupGraph(); buildNiaEdges(); }, 30000);
  setInterval(() => { cleanupGraph(); buildNiaEdges(); }, 30 * 60 * 1000);
}

function stopMonitoring(): void {
  if (windowPollTimer) { clearInterval(windowPollTimer); windowPollTimer = null; }
  if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (patternTimer) { clearInterval(patternTimer); patternTimer = null; }
  if (summaryTimer) { clearInterval(summaryTimer); summaryTimer = null; }
  if (fastIntentTimer) { clearInterval(fastIntentTimer); fastIntentTimer = null; }
  if (clipboardTimer) { clearInterval(clipboardTimer); clipboardTimer = null; }
  if (nowPlayingTimer) { clearInterval(nowPlayingTimer); nowPlayingTimer = null; }
  if (graphSaveTimer) { clearInterval(graphSaveTimer); graphSaveTimer = null; }
  if (aiExtractTimer) { clearInterval(aiExtractTimer); aiExtractTimer = null; }
  saveGraphToStore();
  updateStatus('inactive');
  console.log('[Enk] Monitoring stopped');
}

// ─── Windows ────────────────────────────────────────────────────
const uiPath = (...segments: string[]) => path.join(__dirname, '..', 'src', 'ui', ...segments);
const preloadPath = () => path.join(__dirname, 'preload.js');

function createChatWindow(): void {
  if (chatWindow && !chatWindow.isDestroyed()) { chatWindow.focus(); return; }
  chatWindow = new BrowserWindow({
    width: 900, height: 650, minWidth: 700, minHeight: 500,
    frame: true, titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f172a',
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
  });
  chatWindow.loadFile(uiPath('chat.html'));
  chatWindow.on('closed', () => { chatWindow = null; });
}

function createIndicatorWindow(): void {
  indicatorWindow = new BrowserWindow({
    width: 72, height: 72,
    x: screen.getPrimaryDisplay().workAreaSize.width - 90,
    y: screen.getPrimaryDisplay().workAreaSize.height - 90,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, focusable: false, hasShadow: false,
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
  } as any);
  indicatorWindow.loadFile(uiPath('indicator.html'));
  indicatorWindow.setIgnoreMouseEvents(true, { forward: true });
  indicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  indicatorWindow.setContentProtection(true);
}

function createOverlayWindow(): void {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow = new BrowserWindow({
    width: 520, height: 100, x: width - 520 - 12, y: 12,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, focusable: false, hasShadow: false,
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
  } as any);
  overlayWindow.loadFile(uiPath('overlay.html'));
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setContentProtection(true);
  overlayWindow.showInactive();
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 520, height: 650, frame: true, resizable: false,
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
  });
  settingsWindow.loadFile(uiPath('settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─── IPC Handlers ───────────────────────────────────────────────
ipcMain.handle('get-settings', (): Settings => ({
  anthropicKey: store.get('anthropicKey') as string,
  niaKey: store.get('niaKey') as string,
  enabled: store.get('enabled') as boolean,
  scamDetection: store.get('scamDetection') as boolean,
  firstLaunch: store.get('firstLaunch') as boolean,
}));

ipcMain.handle('save-settings', (_: IpcMainInvokeEvent, settings: Partial<Settings>) => {
  if (settings.anthropicKey !== undefined) store.set('anthropicKey', settings.anthropicKey);
  if (settings.niaKey !== undefined) store.set('niaKey', settings.niaKey);
  if (settings.enabled !== undefined) store.set('enabled', settings.enabled);
  if (settings.scamDetection !== undefined) store.set('scamDetection', settings.scamDetection);
  if (settings.firstLaunch !== undefined) store.set('firstLaunch', settings.firstLaunch);
  if (settings.niaKey) nia.setApiKey(settings.niaKey);
  if (settings.enabled === false) stopMonitoring();
  else if (settings.enabled === true) startMonitoring();
  return true;
});

ipcMain.handle('chat-query', async (_: IpcMainInvokeEvent, query: string) => handleChatQuery(query));
ipcMain.handle('get-activity-stats', () => getLocalStats());
ipcMain.handle('export-md', async (_: IpcMainInvokeEvent, type: string, date?: string) => exportMarkdown(type, date));
ipcMain.handle('flush-now', async () => { await flushToNia(); return true; });
ipcMain.handle('detect-patterns-now', async () => { await detectPatterns(); });
ipcMain.handle('search-nia', async (_: IpcMainInvokeEvent, query: string) => {
  if (!store.get('niaKey')) return [];
  nia.setApiKey(store.get('niaKey') as string);
  try { return await nia.semanticSearch(query, { limit: 20 }); } catch { return []; }
});

ipcMain.handle('list-nia-contexts', async (_: IpcMainInvokeEvent, opts?: { tags?: string; limit?: number }) => {
  if (!store.get('niaKey')) return [];
  nia.setApiKey(store.get('niaKey') as string);
  try { return await nia.listContexts({ tags: opts?.tags, limit: opts?.limit || 50 }); } catch { return []; }
});

ipcMain.handle('get-session-stats', () => ({
  activityEntries: getAllActivity().length,
  contentSnapshots: getAllSnapshots().length,
  pendingSummaries: pendingSummaries.length,
  currentApp: currentWindow.app || 'None',
  sessionStart: getAllActivity().length > 0 ? getAllActivity()[0].start : Date.now(),
  knowledgeSize: localKnowledge.length,
  entityCount: entityNodes.size,
  clipboardCount: clipboardLog.length,
  nowPlayingCount: nowPlayingLog.length,
  cacheAge: knowledgeLastConsolidated ? Math.round((Date.now() - knowledgeLastConsolidated) / 1000) : -1,
}));

ipcMain.handle('get-entity-graph', () => getGraphData());

ipcMain.handle('get-node-detail', (_: IpcMainInvokeEvent, nodeId: string) => getNodeDetailData(nodeId));

ipcMain.handle('get-edge-detail', (_: IpcMainInvokeEvent, sourceId: string, targetId: string) => getEdgeDetailData(sourceId, targetId));

ipcMain.handle('preview-graph-group', async (_: IpcMainInvokeEvent, nodeIds: string[]) => {
  if (!store?.get('anthropicKey') || nodeIds.length === 0) return { preview: '' };
  const labels = nodeIds.map(id => entityNodes.get(id)?.label).filter(Boolean).join(', ');
  if (!labels) return { preview: '' };
  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 60,
    system: 'In one short sentence (under 15 words), describe what this group of entities might represent together. Be specific. Example: "Startup Week project with NYU Tech" or "Japan trip planning with Ben".',
    messages: [{ role: 'user', content: `Entities: ${labels}` }],
  });
  const preview = data?.content?.[0]?.text?.trim() || '';
  return { preview };
});

ipcMain.handle('get-understanding-preview', () => ({
  knowledge: localKnowledge.slice(0, 1200),
  activityCount: getAllActivity().length,
  snapshotCount: getAllSnapshots().length,
  entityCount: entityNodes.size,
}));

ipcMain.handle('analyze-graph-group', async (_: IpcMainInvokeEvent, nodeIds: string[]) => {
  if (!store?.get('anthropicKey') || nodeIds.length === 0) return { error: 'No API key or no nodes selected' };

  const nodesInfo = nodeIds.map(id => {
    const node = entityNodes.get(id);
    if (!node) return null;
    const ctx = getNodeContext(id, node.label);
    return { label: node.label, type: node.type, mentions: node.weight, context: ctx };
  }).filter(Boolean);

  const edgesInfo = Array.from(entityEdges.values())
    .filter(e => nodeIds.includes(e.source) && nodeIds.includes(e.target))
    .map(e => {
      const src = entityNodes.get(e.source);
      const tgt = entityNodes.get(e.target);
      return { from: src?.label, to: tgt?.label, coOccurrences: e.weight };
    });

  const contextStr = nodesInfo.map((n: any) => {
    let s = `**${n.label}** (${n.type}, ${n.mentions} mentions)`;
    if (n.context.relatedActivity.length > 0) {
      s += '\nActivity: ' + n.context.relatedActivity.map((a: any) => `${a.app}: "${a.title}"${a.summary ? ' — ' + a.summary : ''}`).join('; ');
    }
    if (n.context.relatedContent.length > 0) {
      s += '\nScreen: ' + n.context.relatedContent.map((c: any) => c.summary || c.textPreview).join('; ');
    }
    return s;
  }).join('\n\n');

  const edgeStr = edgesInfo.length > 0
    ? '\n\nConnections between them:\n' + edgesInfo.map(e => `${e.from} <-> ${e.to} (${e.coOccurrences}x)`).join('\n')
    : '';

  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system: `You analyze groups of entities from a user's computer activity. Explain how these entities relate to each other and what the user was likely doing. Be specific and concise. Use the activity and screen context provided.`,
    messages: [{ role: 'user', content: `Analyze this group of entities from my computer activity:\n\n${contextStr}${edgeStr}` }],
  });

  if (!data) return { error: 'AI request failed' };
  return { analysis: data.content?.[0]?.text || 'No analysis generated' };
});

ipcMain.handle('get-local-knowledge', () => localKnowledge);

ipcMain.on('open-settings', () => createSettingsWindow());
ipcMain.on('open-chat', () => createChatWindow());
ipcMain.on('overlay-mouse-enter', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setIgnoreMouseEvents(false);
});
ipcMain.on('overlay-mouse-leave', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setIgnoreMouseEvents(true, { forward: true });
});
ipcMain.on('resize-overlay', (_: any, height: number) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const bounds = overlayWindow.getBounds();
    overlayWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: Math.max(100, height) });
  }
});

// ─── App Lifecycle ──────────────────────────────────────────────
app.whenReady().then(async () => {
  await initStore();

  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    console.log('[Enk] Screen recording permission:', status);
  }

  createIndicatorWindow();
  createOverlayWindow();

  if (store.get('firstLaunch') === undefined) store.set('firstLaunch', true);

  console.log('[Enk] Initializing Tesseract...');
  try { await initTesseract(); } catch (err) { console.error('[Enk] Tesseract init failed:', err); }

  loadGraphFromStore();

  try {
    const rawActivity = store?.get('persistedActivity');
    loadedActivity = Array.isArray(rawActivity) ? rawActivity : [];
    const rawSnapshots = store?.get('persistedSnapshots');
    loadedSnapshots = Array.isArray(rawSnapshots)
      ? rawSnapshots.map((s: any) => ({ ...s, fullText: s.fullText || s.text || '' }))
      : [];
    if (loadedActivity.length > 0 || loadedSnapshots.length > 0) {
      console.log(`[Enk] Loaded ${loadedActivity.length} activity entries, ${loadedSnapshots.length} snapshots from previous sessions`);
    }
  } catch (e) {
    console.warn('[Enk] Failed to load persisted activity/snapshots:', (e as Error).message);
  }

  createChatWindow();

  (async () => {
    await initSoulAndUser();
    await initLocalKnowledge();
    if (store.get('enabled')) startMonitoring();
    console.log('[Enk] Startup complete');
  })().catch(e => console.error('[Enk] Startup error:', (e as Error).message));
});

app.on('activate', () => createChatWindow());
app.on('before-quit', async () => {
  saveGraphToStore();
  // Persist activity/snapshots so we remember across restarts (even if no flush happened)
  try {
    const combinedActivity = [...loadedActivity, ...activityLog].sort((a, b) => a.start - b.start).slice(-PERSISTED_ACTIVITY_MAX);
    const combinedSnapshots = [...loadedSnapshots, ...contentSnapshots].sort((a, b) => a.timestamp - b.timestamp).slice(-PERSISTED_SNAPSHOTS_MAX);
    store?.set('persistedActivity', combinedActivity);
    store?.set('persistedSnapshots', combinedSnapshots.map(s => ({
      timestamp: s.timestamp, app: s.app, title: s.title, url: s.url,
      text: s.text.slice(0, 400), fullText: '', summary: s.summary,
    })));
  } catch {}
  try { await flushToNia(); } catch { /* best effort */ }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
