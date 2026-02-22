import type { NiaClient } from '../../nia-client';
import { exportMarkdown as exportMarkdownFromModule } from './export';
import { handleChatQuery as handleChatQueryFromModule } from './chat';
import { createPatternDetector } from '../knowledge/patterns';
import { DEFAULT_SOUL, DEFAULT_USER, initSoulAndUser as initSoulAndUserFromModule } from '../knowledge/soul';

import type { ActivityEntry, ClaudeRequestBody, ClaudeResponse, ContentSnapshot } from '../../types';

interface CreateAssistantApiDeps {
  getStore: () => any;
  nia: NiaClient;
  localKnowledgeCache: {
    maybeConsolidate: () => void;
    getSnapshot: () => {
      cachedSoul: string;
      cachedUserProfile: string;
      localKnowledge: string;
      knowledgeLastConsolidated: number;
    };
    getKnowledge: () => string;
  };
  getAllActivity: () => ActivityEntry[];
  getAllSnapshots: () => ContentSnapshot[];
  getCurrentWindow: () => { app: string; title: string; url: string | null };
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  appendKnowledge: (facts: string[]) => void;
}

function createAssistantApi(deps: CreateAssistantApiDeps) {
  let patternDetector: ReturnType<typeof createPatternDetector> | null = null;

  async function initSoulAndUser(): Promise<void> {
    if (!deps.getStore().get('firstLaunch')) return;
    await initSoulAndUserFromModule({ store: deps.getStore(), nia: deps.nia });
  }

  async function handleChatQuery(query: string): Promise<{ response?: string; error?: string }> {
    deps.localKnowledgeCache.maybeConsolidate();
    const { cachedSoul, cachedUserProfile, localKnowledge } = deps.localKnowledgeCache.getSnapshot();

    return handleChatQueryFromModule(
      {
        store: deps.getStore(),
        nia: deps.nia,
        cachedSoul,
        cachedUserProfile,
        localKnowledge,
        getAllActivity: deps.getAllActivity,
        getAllSnapshots: deps.getAllSnapshots,
        currentWindow: deps.getCurrentWindow(),
        claudeRequest: deps.claudeRequest,
      },
      query
    );
  }

  function initPatternDetector(): void {
    if (patternDetector || !deps.getStore()) return;
    patternDetector = createPatternDetector({
      store: deps.getStore(),
      nia: deps.nia,
      getLocalKnowledge: () => deps.localKnowledgeCache.getKnowledge(),
      appendKnowledge: deps.appendKnowledge,
      claudeRequest: deps.claudeRequest,
    });
  }

  async function detectPatterns(): Promise<void> {
    initPatternDetector();
    if (!patternDetector) return;
    await patternDetector.detectPatterns();
  }

  async function exportMarkdown(type: string, date?: string): Promise<{ content?: string; filename?: string; error?: string }> {
    return exportMarkdownFromModule(
      {
        store: deps.getStore(),
        nia: deps.nia,
        defaultSoul: DEFAULT_SOUL,
        defaultUser: DEFAULT_USER,
      },
      type,
      date
    );
  }

  function getLocalStats() {
    const appUsage: Record<string, number> = {};
    for (const entry of deps.getAllActivity()) {
      appUsage[entry.app] = (appUsage[entry.app] || 0) + entry.duration;
    }

    const current = deps.getCurrentWindow();
    if (current.app) {
      const elapsed = Date.now() - (current as any).since;
      appUsage[current.app] = (appUsage[current.app] || 0) + elapsed;
    }

    const sorted = Object.entries(appUsage)
      .sort(([, a], [, b]) => b - a)
      .map(([appName, ms]) => ({ app: appName, minutes: Math.round(ms / 60000), seconds: Math.round(ms / 1000) }));

    const allActivity = deps.getAllActivity();
    return {
      apps: sorted,
      totalSwitches: allActivity.length,
      recentActivity: allActivity.slice(-50).map((entry) => ({
        app: entry.app,
        title: entry.title,
        url: entry.url,
        start: entry.start,
        duration: entry.duration,
        summary: entry.summary,
      })),
    };
  }

  return {
    initSoulAndUser,
    handleChatQuery,
    initPatternDetector,
    detectPatterns,
    exportMarkdown,
    getLocalStats,
  };
}

export { createAssistantApi };
