import { queryMemory, saveSnapshot } from './memory';
import type { NiaNode, NiaQueryResult } from '../types';

let memoryStore: NiaNode[] = [];

const SEED_DATA: NiaNode[] = [
  {
    session_id: 'seed-001',
    timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000,
    app: 'VSCode',
    window_title: 'auth-service.ts — enk-backend',
    url: null,
    task_label: 'Implementing JWT token refresh logic in the auth service.',
    entities: ['JWT', 'auth-service.ts', 'enk-backend', 'AUTH-142'],
    visible_text: 'async function refreshToken(token: string) { const decoded = jwt.verify(token, SECRET)...',
    raw_context: {}
  },
  {
    session_id: 'seed-002',
    timestamp: Date.now() - 5.5 * 24 * 60 * 60 * 1000,
    app: 'Google Chrome',
    window_title: 'Pull Request #87 — Add rate limiting middleware',
    url: 'https://github.com/team/enk-backend/pull/87',
    task_label: 'Reviewing pull request for rate limiting middleware implementation.',
    entities: ['PR-87', 'rate-limiting', 'enk-backend', 'https://github.com/team/enk-backend/pull/87'],
    visible_text: 'This PR adds express-rate-limit middleware with Redis backing store. Changes in 4 files...',
    raw_context: {}
  },
  {
    session_id: 'seed-003',
    timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
    app: 'Notion',
    window_title: 'Sprint Planning — Week 12',
    url: 'https://notion.so/team/sprint-planning-week12',
    task_label: 'Planning sprint tasks and assigning story points for week 12.',
    entities: ['Sprint', 'Planning', 'AUTH-142', 'AUTH-155', 'INFRA-78'],
    visible_text: 'Sprint goals: 1. Complete auth token refresh 2. Deploy rate limiter 3. Fix memory leak in worker...',
    raw_context: {}
  },
  {
    session_id: 'seed-004',
    timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000,
    app: 'Terminal',
    window_title: 'zsh — ~/projects/enk-backend',
    url: null,
    task_label: 'Debugging failing integration tests for the auth module.',
    entities: ['enk-backend', 'jest', 'auth.test.ts', 'AUTH-142'],
    visible_text:
      'FAIL src/auth/__tests__/auth.test.ts ● Token refresh › should reject expired tokens Expected: 401 Received: 200...',
    raw_context: {}
  },
  {
    session_id: 'seed-005',
    timestamp: Date.now() - 3.5 * 24 * 60 * 60 * 1000,
    app: 'Gmail',
    window_title: 'Re: Production incident — memory leak in worker process',
    url: 'https://mail.google.com/mail/u/0/#inbox/18f3a2b1c4d5e6f7',
    task_label: 'Reading incident report about memory leak in production worker process.',
    entities: ['INFRA-78', 'worker', 'memory-leak', 'production'],
    visible_text:
      'The worker process RSS grew from 256MB to 1.2GB over 6 hours. Heap snapshot shows retained event listeners...',
    raw_context: {}
  },
  {
    session_id: 'seed-006',
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
    app: 'VSCode',
    window_title: 'worker.ts — enk-backend',
    url: null,
    task_label: 'Fixing memory leak by removing stale event listeners in the worker.',
    entities: ['worker.ts', 'enk-backend', 'INFRA-78', 'EventEmitter'],
    visible_text: 'process.on("message", handler) // BUG: handler is re-registered on every reconnect without cleanup...',
    raw_context: {}
  },
  {
    session_id: 'seed-007',
    timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
    app: 'Google Chrome',
    window_title: 'Claude API Documentation — Tool Use',
    url: 'https://docs.anthropic.com/en/docs/build-with-claude/tool-use',
    task_label: 'Researching Claude API tool use patterns for the Enk integration.',
    entities: ['Claude', 'Anthropic', 'tool-use', 'https://docs.anthropic.com/en/docs/build-with-claude/tool-use'],
    visible_text: 'Tool use allows Claude to interact with external tools and APIs. Define tools with JSON Schema...',
    raw_context: {}
  },
  {
    session_id: 'seed-008',
    timestamp: Date.now() - 1.5 * 24 * 60 * 60 * 1000,
    app: 'VSCode',
    window_title: 'claude.js — enk',
    url: null,
    task_label: 'Updating the Claude API integration to use structured tool responses.',
    entities: ['claude.js', 'enk', 'queryElephant', 'analyzeWithClaude'],
    visible_text: 'const ELEPHANT_SYSTEM_PROMPT = `You are Enk Elephant, a personal memory and context assistant...`',
    raw_context: {}
  },
  {
    session_id: 'seed-009',
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
    app: 'Notion',
    window_title: 'Enk Product Roadmap',
    url: 'https://notion.so/team/enk-roadmap',
    task_label: 'Updating the Enk product roadmap with Elephant feature milestones.',
    entities: ['Enk', 'Elephant', 'Nia', 'roadmap', 'https://notion.so/team/enk-roadmap'],
    visible_text: 'Phase 1: Guardian + Lens MVP. Phase 2: Elephant memory system with Nia backend. Phase 3: Cross-device sync...',
    raw_context: {}
  },
  {
    session_id: 'seed-010',
    timestamp: Date.now() - 0.5 * 24 * 60 * 60 * 1000,
    app: 'Terminal',
    window_title: 'zsh — ~/projects/enk',
    url: null,
    task_label: 'Running Enk in dev mode and testing the Elephant panel hotkey.',
    entities: ['enk', 'electron', 'npm-start', 'Alt+K'],
    visible_text: '[Enk] Initializing Tesseract... [Enk] Screen recording permission: granted [Enk] Elephant shortcut registered...',
    raw_context: {}
  }
];

function init(): void {
  memoryStore = [...SEED_DATA];
  console.log(`[Enk] NiaMock initialized with ${SEED_DATA.length} seed sessions`);
}

async function write(node: NiaNode): Promise<void> {
  memoryStore.push({ ...node });

  saveSnapshot({
    activeApp: node.app,
    windowTitle: node.window_title,
    url: node.url,
    visibleText: node.visible_text
  });

  console.log(`[Enk] NiaMock wrote node: ${node.task_label || node.app}`);
}

async function query(queries: string[]): Promise<NiaQueryResult[]> {
  const allResults: NiaQueryResult[] = [];

  for (const q of queries) {
    const keywords = q
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (const node of memoryStore) {
      const searchText = [
        node.task_label || '',
        node.app || '',
        node.window_title || '',
        node.url || '',
        (node.entities || []).join(' '),
        (node.visible_text || '').slice(0, 500)
      ]
        .join(' ')
        .toLowerCase();

      let matchCount = 0;
      for (const kw of keywords) {
        if (searchText.includes(kw)) matchCount++;
      }

      if (matchCount === 0) continue;

      const keywordScore = keywords.length > 0 ? matchCount / keywords.length : 0;

      const ageMs = Date.now() - node.timestamp;
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      const recencyScore = Math.max(0, 1 - ageDays / 7);

      const relevanceScore = Math.round((keywordScore * 0.6 + recencyScore * 0.4) * 100) / 100;

      allResults.push({
        session_id: node.session_id,
        task_label: node.task_label || '',
        app: node.app,
        url: node.url,
        timestamp: node.timestamp,
        relevance_score: relevanceScore,
        snippet: node.task_label || (node.visible_text || '').slice(0, 200)
      });
    }

    try {
      const appMatch = q.match(/in (\w+)/i);
      const app = appMatch ? appMatch[1] : null;
      const sqlResults = queryMemory(app, null, q);
      for (const r of sqlResults) {
        allResults.push({
          session_id: `sqlite-${r.id}`,
          task_label: r.summary || '',
          app: r.active_app,
          url: r.url,
          timestamp: r.timestamp,
          relevance_score: 0.3,
          snippet: r.summary || (r.visible_text || '').slice(0, 200)
        });
      }
    } catch {
      // SQLite query is best-effort.
    }
  }

  const seen = new Set<string>();
  const deduped: NiaQueryResult[] = [];
  for (const r of allResults) {
    if (!seen.has(r.session_id)) {
      seen.add(r.session_id);
      deduped.push(r);
    }
  }

  deduped.sort((a, b) => b.relevance_score - a.relevance_score);

  return deduped;
}

function clear(): void {
  memoryStore = [];
  console.log('[Enk] NiaMock memory cleared');
}

export { init, write, query, clear };
