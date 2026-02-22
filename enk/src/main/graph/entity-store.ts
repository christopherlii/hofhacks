import type { EntityEdge, EntityNode } from '../../types';

const CONTEXT_HINT_MAX = 100;

const SKIP_ENTITIES = new Set([
  '',
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'you',
  'your',
  'http',
  'https',
  'www',
  'com',
  'org',
  'net',
  'html',
  'undefined',
  'null',
  'new',
  'tab',
  'untitled',
  'loading',
  'about:blank',
]);

function normalizeEntity(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^\w\s@#-]/g, '').trim();
}

class EntityStore {
  readonly nodes: Map<string, EntityNode> = new Map();
  readonly edges: Map<string, EntityEdge> = new Map();
  readonly recentContexts: { entity: string; contextHint: string }[] = [];

  addEntity(
    label: string,
    type: EntityNode['type'],
    getCurrentApp: () => string,
    sourceContext?: string,
    contextHintForEdge?: string,
  ): void {
    const normalized = normalizeEntity(label);
    const id = `${type}:${normalized}`;

    if (SKIP_ENTITIES.has(normalized) || normalized.length < 2) return;

    const context = sourceContext || getCurrentApp() || 'unknown';
    const now = Date.now();
    const existing = this.nodes.get(id);

    if (existing) {
      existing.weight++;
      existing.lastSeen = now;
      if (!existing.contexts.includes(context)) existing.contexts.push(context);
    } else {
      this.nodes.set(id, {
        id,
        label: label.trim(),
        type,
        weight: 1,
        firstSeen: now,
        lastSeen: now,
        contexts: [context],
        verified: false,
      });
    }

    if (contextHintForEdge && contextHintForEdge.length > 5) {
      this.recentContexts.push({ entity: id, contextHint: contextHintForEdge });
      this.updateCoOccurrences(id, contextHintForEdge);
    }
  }

  pruneOrphanedEdges(): void {
    for (const [key, edge] of this.edges) {
      if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
        this.edges.delete(key);
      }
    }
  }

  private updateCoOccurrences(newEntityId: string, newContextHint: string): void {
    for (const entry of this.recentContexts) {
      if (entry.entity === newEntityId) continue;
      if (entry.contextHint !== newContextHint) continue;

      const edgeKey = [entry.entity, newEntityId].sort().join('↔');
      const existing = this.edges.get(edgeKey);
      if (existing) {
        existing.weight++;
      } else {
        this.edges.set(edgeKey, { source: entry.entity, target: newEntityId, weight: 1 });
      }
    }

    while (this.recentContexts.length > CONTEXT_HINT_MAX) {
      this.recentContexts.shift();
    }
  }
}

export { EntityStore, normalizeEntity };
