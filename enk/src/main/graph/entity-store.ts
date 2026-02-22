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
  return raw.trim().toLowerCase().replace(/^@+/, '').replace(/[^\w\s@#-]/g, '').trim();
}

/** Find canonical node for deduplication. Handles person (Ben→Benjamin Xu), place/topic (@NYU→NYU), project. */
function findCanonicalNode(
  nodes: Map<string, EntityNode>,
  label: string,
  type: EntityNode['type'],
): string | null {
  const n = normalizeEntity(label);
  if (n.length < 2) return null;
  const typesToCheck: EntityNode['type'][] = type === 'person' ? ['person'] : type === 'place' || type === 'topic' ? ['place', 'topic'] : type === 'project' ? ['project'] : [];
  let best: { id: string; len: number } | null = null;
  for (const node of nodes.values()) {
    if (!typesToCheck.includes(node.type)) continue;
    const nodeNorm = normalizeEntity(node.label);
    if (nodeNorm === n) return node.id;
    const [shorter, longer] = n.length <= nodeNorm.length ? [n, nodeNorm] : [nodeNorm, n];
    const isMatch =
      longer.startsWith(shorter) ||
      longer.includes(` ${shorter}`) ||
      longer.includes(`${shorter} `) ||
      shorter.length >= 4 && longer.includes(shorter);
    if (isMatch) {
      const len = nodeNorm.length;
      if (!best || len > best.len) best = { id: node.id, len };
    }
  }
  return best?.id ?? null;
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
    if (SKIP_ENTITIES.has(normalized) || normalized.length < 2) return;

    const canonicalId = findCanonicalNode(this.nodes, label, type);
    const id = canonicalId ?? `${type}:${normalized}`;
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
      if (
        !this.nodes.has(edge.source) ||
        !this.nodes.has(edge.target) ||
        edge.source === edge.target
      ) {
        this.edges.delete(key);
      }
    }
  }

  /** Clear all entities and edges. */
  reset(): void {
    this.nodes.clear();
    this.edges.clear();
    this.recentContexts.length = 0;
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

  /** Add or strengthen an edge with a semantic relation. Resolves labels to node ids. */
  addRelation(fromLabel: string, toLabel: string, relation: string): void {
    const fromId = this.findNodeByLabel(fromLabel);
    const toId = this.findNodeByLabel(toLabel);
    if (!fromId || !toId || fromId === toId) return;
    const [a, b] = [fromId, toId].sort();
    const edgeKey = `${a}↔${b}`;
    const existing = this.edges.get(edgeKey);
    if (existing) {
      existing.weight++;
      if (relation && !existing.relation) existing.relation = relation;
    } else {
      this.edges.set(edgeKey, { source: a, target: b, weight: 1, relation });
    }
  }

  private findNodeByLabel(label: string): string | null {
    const n = normalizeEntity(label);
    if (n.length < 2) return null;
    let fallback: string | null = null;
    for (const node of this.nodes.values()) {
      const nodeNorm = normalizeEntity(node.label);
      if (nodeNorm === n) return node.id;
      if (n.length < nodeNorm.length && (nodeNorm.startsWith(n) || nodeNorm.includes(` ${n}`) || nodeNorm.includes(`${n} `))) {
        fallback ??= node.id;
      }
    }
    return fallback;
  }
}

export { EntityStore, normalizeEntity };
