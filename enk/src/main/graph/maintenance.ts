import type { NiaClient } from '../../nia-client';
import type { ClaudeRequestBody, ClaudeResponse } from '../../types';
import type { EntityStore } from './entity-store';

const GRAPH_DECAY_STALE_DAYS = 7;
const GRAPH_DECAY_MIN_WEIGHT = 2;
const EDGE_DECAY_DAYS = 5;

function decayGraph(store: EntityStore, saveGraphToStore: () => void): void {
  const cutoff = Date.now() - GRAPH_DECAY_STALE_DAYS * 24 * 60 * 60 * 1000;
  let prunedNodes = 0;

  for (const [id, node] of store.nodes) {
    // More aggressive pruning for low-weight, unverified nodes
    const minWeight = node.verified ? 1 : GRAPH_DECAY_MIN_WEIGHT;
    if (node.weight < minWeight && node.lastSeen < cutoff) {
      store.nodes.delete(id);
      prunedNodes++;
    }
  }

  // Also decay edges
  const prunedEdges = store.decayEdges(EDGE_DECAY_DAYS);

  store.pruneOrphanedEdges();

  if (prunedNodes > 0 || prunedEdges > 0) {
    console.log(`[Enk] Graph decay: pruned ${prunedNodes} nodes, ${prunedEdges} edges`);
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

  // Only use verified or high-weight entities
  const topEntities = Array.from(entityStore.nodes.values())
    .filter((node) => node.type !== 'app' && (node.verified || node.weight >= 3))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 20);

  if (topEntities.length < 2) return;

  const contextToEntities: Map<string, Set<string>> = new Map();

  for (const node of topEntities) {
    try {
      const results = await withTimeout(nia.semanticSearch(node.label, { limit: 3 }), 3000);
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
    if (ids.length < 2 || ids.length > 5) continue; // Skip if too many entities share context (too generic)

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        const edgeKey = `${a}↔${b}`;
        const existing = entityStore.edges.get(edgeKey);
        if (existing) {
          existing.weight++;
        } else {
          entityStore.edges.set(edgeKey, { source: a, target: b, weight: 1, relation: 'nia_context' });
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
    .slice(0, 50);

  if (unverified.length === 0) return { nodesRemoved: 0, edgesRemoved: 0 };

  const entityList = unverified
    .map(
      (node) =>
        `${node.id} | "${node.label}" | ${node.type} | weight:${node.weight} | contexts:[${node.contexts.slice(-3).join(',')}]`
    )
    .join('\n');

  const data = await claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system: `You classify entities from a personal computer activity graph as SIGNAL or NOISE.

SIGNAL = personally meaningful entities that a user would recognize and care about:
- Real people they know (names, usernames)
- Specific projects they're working on
- Topics they're genuinely interested in (not just browsed once)
- Places meaningful to them
- Goals or plans
- Specific content they engaged with deeply

NOISE = artifacts that shouldn't be in a personal knowledge graph:
- UI elements, generic words ("loading", "untitled", "page 1")
- System/app names when not relevant
- Partial words, typos, OCR errors
- Generic roles ("user", "admin", "guest")
- Navigation elements
- Duplicate entities (same thing with different casing/spelling)
- Overly broad topics ("technology", "internet", "news")

Return JSON:
{
  "keep": ["entity_id", ...],
  "remove": ["entity_id", ...],
  "merge": [{"into": "entity_id", "from": ["entity_id", ...]}]
}

Rules:
- Be AGGRESSIVE about removing noise - when in doubt, remove
- For merge: combine duplicates (e.g., "NYU" and "@NYU" → keep "NYU"; "Ben" and "Benjamin Xu" → keep "Benjamin Xu")
- Prefer more descriptive labels when merging
- If an entity appears in only 1 context with low weight, it's probably noise`,
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
            if (!target.contexts.includes(context)) {
              target.contexts = target.contexts.slice(-9);
              target.contexts.push(context);
            }
          }
          if (source.firstSeen < target.firstSeen) target.firstSeen = source.firstSeen;
          if (source.lastSeen > target.lastSeen) target.lastSeen = source.lastSeen;

          // Transfer edges from merged node to target
          for (const [edgeKey, edge] of entityStore.edges) {
            if (edge.source === fromId) {
              entityStore.edges.delete(edgeKey);
              const newKey = [target.id, edge.target].sort().join('↔');
              const existing = entityStore.edges.get(newKey);
              if (existing) {
                existing.weight += edge.weight;
              } else if (target.id !== edge.target) {
                entityStore.edges.set(newKey, { ...edge, source: target.id });
              }
            } else if (edge.target === fromId) {
              entityStore.edges.delete(edgeKey);
              const newKey = [edge.source, target.id].sort().join('↔');
              const existing = entityStore.edges.get(newKey);
              if (existing) {
                existing.weight += edge.weight;
              } else if (edge.source !== target.id) {
                entityStore.edges.set(newKey, { ...edge, target: target.id });
              }
            }
          }

          entityStore.nodes.delete(fromId);
          merged++;
        }

        target.verified = true;
      }
    }

    entityStore.pruneOrphanedEdges();

    if (removed > 0 || merged > 0) {
      const stats = entityStore.getStats();
      console.log(`[Enk] Graph cleanup: removed ${removed}, merged ${merged}. Stats: ${JSON.stringify(stats)}`);
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
