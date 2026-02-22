import type { NiaClient } from '../nia-client';
import { buildSessionStats, buildUnderstandingPreview } from './ipc/session';
import {
  listNiaContexts as listNiaContextsFromStore,
  searchNiaContexts as searchNiaContextsFromStore,
} from './nia/query';

import type { ClaudeRequestBody, ClaudeResponse } from '../types';

interface CreateInsightsApiDeps {
  getStore: () => any;
  nia: NiaClient;
  getAllActivity: () => any[];
  getAllSnapshots: () => any[];
  getPendingSummariesCount: () => number;
  getCurrentApp: () => string;
  localKnowledgeCache: {
    getSnapshot: () => { localKnowledge: string; knowledgeLastConsolidated: number };
  };
  getEntityCount: () => number;
  getClipboardCount: () => number;
  getNowPlayingCount: () => number;
  getNodeLabel: (nodeId: string) => string | null;
  getNodeDetailData: (nodeId: string) => any;
  getEdgeDetailData: (sourceId: string, targetId: string) => any;
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
}

function createInsightsApi(deps: CreateInsightsApiDeps) {
  async function searchNia(query: string): Promise<any[]> {
    return searchNiaContextsFromStore(deps.getStore(), deps.nia, query);
  }

  async function listNiaContexts(opts?: { tags?: string; limit?: number }): Promise<any[]> {
    return listNiaContextsFromStore(deps.getStore(), deps.nia, opts);
  }

  function getSessionStats() {
    const { localKnowledge, knowledgeLastConsolidated } = deps.localKnowledgeCache.getSnapshot();

    return buildSessionStats({
      activityEntries: deps.getAllActivity().length,
      contentSnapshots: deps.getAllSnapshots().length,
      pendingSummaries: deps.getPendingSummariesCount(),
      currentApp: deps.getCurrentApp() || 'None',
      sessionStart: deps.getAllActivity().length > 0 ? deps.getAllActivity()[0].start : Date.now(),
      knowledgeSize: localKnowledge.length,
      entityCount: deps.getEntityCount(),
      clipboardCount: deps.getClipboardCount(),
      nowPlayingCount: deps.getNowPlayingCount(),
      cacheAge: knowledgeLastConsolidated ? Math.round((Date.now() - knowledgeLastConsolidated) / 1000) : -1,
    });
  }

  async function previewGraphGroup(nodeIds: string[]): Promise<{ preview?: string }> {
    if (!deps.getStore()?.get('anthropicKey') || nodeIds.length === 0) return { preview: '' };

    const labels = nodeIds
      .map((id) => deps.getNodeLabel(id))
      .filter((label): label is string => Boolean(label))
      .join(', ');

    if (!labels) return { preview: '' };

    const data = await deps.claudeRequest({
      model: 'claude-haiku-4-5',
      max_tokens: 60,
      system:
        'In one short sentence (under 15 words), describe what this group of entities might represent together. Be specific. Example: "Startup Week project with NYU Tech" or "Japan trip planning with Ben".',
      messages: [{ role: 'user', content: `Entities: ${labels}` }],
    });

    const preview = data?.content?.[0]?.text?.trim() || '';
    return { preview };
  }

  function getUnderstandingPreview() {
    const { localKnowledge } = deps.localKnowledgeCache.getSnapshot();

    return buildUnderstandingPreview({
      knowledge: localKnowledge.slice(0, 1200),
      activityCount: deps.getAllActivity().length,
      snapshotCount: deps.getAllSnapshots().length,
      entityCount: deps.getEntityCount(),
    });
  }

  async function analyzeGraphGroup(nodeIds: string[]) {
    if (!deps.getStore()?.get('anthropicKey') || nodeIds.length === 0) {
      return { error: 'No API key or no nodes selected' };
    }

    const nodesInfo = nodeIds
      .map((id) => {
        const nodeDetail = deps.getNodeDetailData(id);
        if (!nodeDetail) return null;
        return {
          label: nodeDetail.label,
          type: nodeDetail.type,
          mentions: nodeDetail.weight,
          context: nodeDetail.context,
        };
      })
      .filter(Boolean);

    const edgesInfo: { from?: string; to?: string; coOccurrences: number }[] = [];
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const detail = deps.getEdgeDetailData(nodeIds[i], nodeIds[j]);
        if (!detail) continue;
        edgesInfo.push({
          from: detail.source?.label,
          to: detail.target?.label,
          coOccurrences: detail.weight,
        });
      }
    }

    const contextStr = nodesInfo
      .map((n: any) => {
        let s = `**${n.label}** (${n.type}, ${n.mentions} mentions)`;
        if (n.context.relatedActivity.length > 0) {
          s +=
            '\nActivity: ' +
            n.context.relatedActivity
              .map((a: any) => `${a.app}: "${a.title}"${a.summary ? ' - ' + a.summary : ''}`)
              .join('; ');
        }
        if (n.context.relatedContent.length > 0) {
          s += '\nScreen: ' + n.context.relatedContent.map((c: any) => c.summary || c.textPreview).join('; ');
        }
        return s;
      })
      .join('\n\n');

    const edgeStr =
      edgesInfo.length > 0
        ? '\n\nConnections between them:\n' + edgesInfo.map((e) => `${e.from} <-> ${e.to} (${e.coOccurrences}x)`).join('\n')
        : '';

    const data = await deps.claudeRequest({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system:
        "You analyze groups of entities from a user's computer activity. Explain how these entities relate to each other and what the user was likely doing. Be specific and concise. Use the activity and screen context provided.",
      messages: [{ role: 'user', content: `Analyze this group of entities from my computer activity:\n\n${contextStr}${edgeStr}` }],
    });

    if (!data) return { error: 'AI request failed' };
    return { analysis: data.content?.[0]?.text || 'No analysis generated' };
  }

  return {
    searchNia,
    listNiaContexts,
    getSessionStats,
    previewGraphGroup,
    getUnderstandingPreview,
    analyzeGraphGroup,
  };
}

export { createInsightsApi };
