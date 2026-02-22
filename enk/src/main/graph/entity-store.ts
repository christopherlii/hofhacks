import type { EntityEdge, EntityNode } from '../../types';

const CONTEXT_WINDOW_MS = 30_000; // 30 seconds - entities must appear within this window to be connected
const MIN_COOCCURRENCE_FOR_EDGE = 2; // Require at least 2 co-occurrences before creating an edge
const MAX_RECENT_CONTEXTS = 50; // Smaller window = tighter connections

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
  'unknown',
  'user',
  'admin',
  'home',
  'search',
  'settings',
  'page',
  'document',
]);

function normalizeEntity(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '').replace(/[^\w\s@#-]/g, '').trim();
}

/** 
 * Find canonical node for deduplication. 
 * Aggressively merges across types and handles common variations.
 */
function findCanonicalNode(
  nodes: Map<string, EntityNode>,
  label: string,
  type: EntityNode['type'],
): string | null {
  const n = normalizeEntity(label);
  if (n.length < 2) return null;
  
  // Normalize underscores to spaces for comparison
  const nSpaced = n.replace(/_/g, ' ');
  
  // Types that can be deduplicated together (everything except person and app)
  const typesToCheck: EntityNode['type'][] = 
    type === 'person' ? ['person'] : 
    type === 'app' ? ['app'] :
    // Allow place, topic, project, content, goal to dedupe against each other
    ['place', 'topic', 'project', 'content', 'goal'];
  
  let best: { id: string; len: number; weight: number; exactTypeMatch: boolean } | null = null;
  
  for (const node of nodes.values()) {
    if (!typesToCheck.includes(node.type)) continue;
    const nodeNorm = normalizeEntity(node.label);
    const nodeSpaced = nodeNorm.replace(/_/g, ' ');
    
    // Exact match (with underscore normalization) - always prefer
    if (nodeNorm === n || nodeSpaced === nSpaced || nodeNorm === nSpaced || nodeSpaced === n) {
      // If exact match, prefer same type, then higher weight
      const exactTypeMatch = node.type === type;
      const score = (exactTypeMatch ? 1000 : 0) + node.weight;
      if (!best || score > (best.exactTypeMatch ? 1000 : 0) + best.weight) {
        best = { id: node.id, len: nodeNorm.length, weight: node.weight, exactTypeMatch };
      }
      continue;
    }
    
    const [shorter, longer] = nSpaced.length <= nodeSpaced.length ? [nSpaced, nodeSpaced] : [nodeSpaced, nSpaced];
    const isMatch =
      longer.startsWith(shorter) ||
      longer.includes(` ${shorter}`) ||
      longer.includes(`${shorter} `) ||
      (shorter.length >= 4 && longer.includes(shorter));
    
    if (isMatch) {
      const len = nodeNorm.length;
      const exactTypeMatch = node.type === type;
      // Prefer: same type > longer labels > higher weights
      const score = (exactTypeMatch ? 1000 : 0) + len * 10 + node.weight;
      if (!best || score > (best.exactTypeMatch ? 1000 : 0) + best.len * 10 + best.weight) {
        best = { id: node.id, len, weight: node.weight, exactTypeMatch };
      }
    }
  }
  return best?.id ?? null;
}

interface RecentContext {
  entity: string;
  contextKey: string; // Unique key for the context (app + window title hash)
  timestamp: number;
}

// Track pending edges - only promote to real edges after threshold
interface PendingEdge {
  count: number;
  lastSeen: number;
}

class EntityStore {
  readonly nodes: Map<string, EntityNode> = new Map();
  readonly edges: Map<string, EntityEdge> = new Map();
  private readonly recentContexts: RecentContext[] = [];
  private readonly pendingEdges: Map<string, PendingEdge> = new Map();

  addEntity(
    label: string,
    type: EntityNode['type'],
    getCurrentApp: () => string,
    sourceContext?: string,
    contextHintForEdge?: string,
  ): void {
    const normalized = normalizeEntity(label);
    if (SKIP_ENTITIES.has(normalized) || normalized.length < 2) return;
    
    // Skip if it looks like a file path or code artifact
    if (normalized.includes('/') || normalized.includes('\\') || normalized.match(/\.[a-z]{2,4}$/)) return;

    const canonicalId = findCanonicalNode(this.nodes, label, type);
    const id = canonicalId ?? `${type}:${normalized}`;
    const context = sourceContext || getCurrentApp() || 'unknown';
    const now = Date.now();
    const existing = this.nodes.get(id);

    if (existing) {
      existing.weight++;
      existing.lastSeen = now;
      if (!existing.contexts.includes(context)) {
        existing.contexts = existing.contexts.slice(-9); // Keep last 10 contexts
        existing.contexts.push(context);
      }
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
      // Create a unique context key from the hint
      const contextKey = this.hashContext(contextHintForEdge);
      this.updateCoOccurrences(id, contextKey, now);
    }
  }

  private hashContext(hint: string): string {
    // Simple hash to group similar contexts
    const cleaned = hint.replace(/ai:|timestamp:\d+/g, '').trim().slice(0, 100);
    return cleaned;
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

  reset(): void {
    this.nodes.clear();
    this.edges.clear();
    this.recentContexts.length = 0;
    this.pendingEdges.clear();
  }

  private updateCoOccurrences(newEntityId: string, contextKey: string, timestamp: number): void {
    const windowStart = timestamp - CONTEXT_WINDOW_MS;
    
    // Find entities that appeared in similar contexts within the time window
    for (const entry of this.recentContexts) {
      if (entry.entity === newEntityId) continue;
      if (entry.timestamp < windowStart) continue;
      
      // Must be in the same or very similar context
      if (entry.contextKey !== contextKey) continue;

      const edgeKey = [entry.entity, newEntityId].sort().join('↔');
      
      // Track pending edge
      const pending = this.pendingEdges.get(edgeKey);
      if (pending) {
        pending.count++;
        pending.lastSeen = timestamp;
        
        // Promote to real edge if threshold met
        if (pending.count >= MIN_COOCCURRENCE_FOR_EDGE && !this.edges.has(edgeKey)) {
          this.edges.set(edgeKey, { 
            source: [entry.entity, newEntityId].sort()[0], 
            target: [entry.entity, newEntityId].sort()[1], 
            weight: pending.count 
          });
        } else if (this.edges.has(edgeKey)) {
          this.edges.get(edgeKey)!.weight++;
        }
      } else {
        this.pendingEdges.set(edgeKey, { count: 1, lastSeen: timestamp });
      }
    }

    // Add to recent contexts
    this.recentContexts.push({ entity: newEntityId, contextKey, timestamp });
    
    // Prune old contexts
    while (this.recentContexts.length > MAX_RECENT_CONTEXTS) {
      this.recentContexts.shift();
    }
    
    // Prune old pending edges
    const pendingCutoff = timestamp - 24 * 60 * 60 * 1000; // 24 hours
    for (const [key, pending] of this.pendingEdges) {
      if (pending.lastSeen < pendingCutoff && pending.count < MIN_COOCCURRENCE_FOR_EDGE) {
        this.pendingEdges.delete(key);
      }
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
      existing.weight += 2; // AI-extracted relations get bonus weight
      if (relation && !existing.relation) existing.relation = relation;
    } else {
      // AI relations bypass the pending threshold
      this.edges.set(edgeKey, { source: a, target: b, weight: 2, relation });
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

  /** Decay edge weights over time */
  decayEdges(cutoffDays: number = 7): number {
    const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    
    for (const [key, edge] of this.edges) {
      // Decay edges without semantic relations more aggressively
      const decayThreshold = edge.relation ? 1 : 2;
      if (edge.weight <= decayThreshold) {
        // Check if both nodes are stale
        const sourceNode = this.nodes.get(edge.source);
        const targetNode = this.nodes.get(edge.target);
        if ((!sourceNode || sourceNode.lastSeen < cutoff) && 
            (!targetNode || targetNode.lastSeen < cutoff)) {
          this.edges.delete(key);
          removed++;
        }
      }
    }
    
    return removed;
  }

  /** Get statistics about the graph */
  getStats(): { nodes: number; edges: number; pending: number; avgWeight: number } {
    const weights = Array.from(this.edges.values()).map(e => e.weight);
    const avgWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      pending: this.pendingEdges.size,
      avgWeight: Math.round(avgWeight * 100) / 100,
    };
  }
}

export { EntityStore, normalizeEntity };
