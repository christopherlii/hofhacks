import type { NiaClient } from '../../nia-client';
import type { ClaudeRequestBody, ClaudeResponse } from '../../types';
import type { EntityStore } from './entity-store';

const GRAPH_DECAY_STALE_DAYS = 7;
const GRAPH_DECAY_MIN_WEIGHT = 2;

function decayGraph(store: EntityStore, saveGraphToStore: () => void): void {
  const cutoff = Date.now() - GRAPH_DECAY_STALE_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;

  for (const [id, node] of store.nodes) {
    if (node.weight < GRAPH_DECAY_MIN_WEIGHT && node.lastSeen < cutoff) {
      store.nodes.delete(id);
      pruned++;
    }
  }

  store.pruneOrphanedEdges();

  if (pruned > 0) {
    console.log(`[Enk] Graph decay: pruned ${pruned} stale entities`);
    saveGraphToStore();
  }
}

async function buildNiaEdges(
  entityStore: EntityStore,
  getStore: () => any,
  nia: NiaClient,
  saveGraphToStore: () => void,
): Promise<void> {
  const store = getStore();
  if (!store?.get('niaKey')) return;

  nia.setApiKey(store.get('niaKey') as string);

  const topEntities = Array.from(entityStore.nodes.values())
    .filter((node) => node.type !== 'app')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 25);

  if (topEntities.length < 2) return;

  const contextToEntities: Map<string, Set<string>> = new Map();

  for (const node of topEntities) {
    try {
      const results = await withTimeout(nia.semanticSearch(node.label, { limit: 5 }), 3000);
      if (!results || results.length === 0) continue;

      for (const context of results) {
        const contextId = context.id || context.title || JSON.stringify(context).slice(0, 50);
        if (!contextToEntities.has(contextId)) contextToEntities.set(contextId, new Set());
        contextToEntities.get(contextId)!.add(node.id);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch {
      // continue best-effort
    }
  }

  let added = 0;
  for (const [, entityIds] of contextToEntities) {
    const ids = Array.from(entityIds);
    if (ids.length < 2) continue;

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        const edgeKey = `${a}↔${b}`;
        const existing = entityStore.edges.get(edgeKey);
        if (existing) {
          existing.weight++;
        } else {
          entityStore.edges.set(edgeKey, { source: a, target: b, weight: 1 });
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

async function cleanupGraph(
  entityStore: EntityStore,
  getStore: () => any,
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>,
  saveGraphToStore: () => void,
): Promise<{ nodesRemoved: number; edgesRemoved: number }> {
  const beforeNodes = entityStore.nodes.size;
  const beforeEdges = entityStore.edges.size;
  const store = getStore();
  if (!store?.get('anthropicKey')) return { nodesRemoved: 0, edgesRemoved: 0 };

  const unverified = Array.from(entityStore.nodes.values())
    .filter((node) => !node.verified && node.type !== 'app')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 60);

  if (unverified.length === 0) return { nodesRemoved: 0, edgesRemoved: 0 };

  const entityList = unverified
    .map(
      (node) =>
        `${node.id} | "${node.label}" | ${node.type} | weight:${node.weight} | contexts:[${node.contexts.join(',')}]`
    )
    .join('\n');

  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    system: `You classify entities from a personal computer activity graph as signal or noise.

SIGNAL = personally meaningful: real people, specific topics of interest, projects, specific content (videos/articles), real places, goals (vacations, plans).
NOISE = UI artifacts, generic words ("loading", "untitled", "new tab"), system processes, navigation elements, partial words, single letters, app names as topics, placeholder text, roles ("user", "admin").

Return JSON: {"keep": ["entity_id", ...], "remove": ["entity_id", ...], "merge": [{"into": "entity_id", "from": ["entity_id", ...]}, ...]}

For merge: combine duplicate/similar entities (e.g. "Japan" and "japan travel" → keep the more descriptive one; "Ben" and "Benjamin Xu" → keep "Benjamin Xu").
Be aggressive about removing noise. When in doubt, remove.`,
    messages: [{ role: 'user', content: entityList }],
  });

  if (!data) return { nodesRemoved: 0, edgesRemoved: 0 };
  const text = data.content?.[0]?.text;
  if (!text) return { nodesRemoved: 0, edgesRemoved: 0 };

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { nodesRemoved: 0, edgesRemoved: 0 };

  try {
    const result: { keep?: string[]; remove?: string[]; merge?: { into: string; from: string[] }[] } = JSON.parse(
      jsonMatch[0]
    );

    let removed = 0;
    let merged = 0;

    if (result.remove) {
      for (const id of result.remove) {
        if (entityStore.nodes.has(id)) {
          entityStore.nodes.delete(id);
          removed++;
        }
      }
    }

    if (result.keep) {
      for (const id of result.keep) {
        const node = entityStore.nodes.get(id);
        if (node) node.verified = true;
      }
    }

    if (result.merge) {
      for (const merge of result.merge) {
        const target = entityStore.nodes.get(merge.into);
        if (!target) continue;

        for (const fromId of merge.from) {
          const source = entityStore.nodes.get(fromId);
          if (!source) continue;

          target.weight += source.weight;
          for (const context of source.contexts) {
            if (!target.contexts.includes(context)) target.contexts.push(context);
          }
          if (source.firstSeen < target.firstSeen) target.firstSeen = source.firstSeen;
          if (source.lastSeen > target.lastSeen) target.lastSeen = source.lastSeen;

          entityStore.nodes.delete(fromId);
          merged++;
        }

        target.verified = true;
      }
    }

    entityStore.pruneOrphanedEdges();

    if (removed > 0 || merged > 0) {
      console.log(`[Enk] Graph cleanup: removed ${removed}, merged ${merged}. ${entityStore.nodes.size} entities remain.`);
      saveGraphToStore();
    }
  } catch (err: any) {
    console.error('[Enk] Graph cleanup parse error:', err.message);
  }
  const nodesRemoved = beforeNodes - entityStore.nodes.size;
  const edgesRemoved = beforeEdges - entityStore.edges.size;
  return { nodesRemoved, edgesRemoved };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

export { decayGraph, buildNiaEdges, cleanupGraph };
