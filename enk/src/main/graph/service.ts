import type { NiaClient } from '../../nia-client';
import type { ActivityEntry, ClaudeRequestBody, ClaudeResponse, ContentSnapshot, EntityNode } from '../../types';
import { EntityStore } from './entity-store';
import { aiExtractEntities, extractEntitiesFromActivity } from './extraction';
import { buildNiaEdges, cleanupGraph, decayGraph } from './maintenance';
import { getEdgeDetailData, getGraphData, getNodeDetailData } from './queries';

interface ClipboardEntry {
  text: string;
  timestamp: number;
  app: string;
}

interface NowPlayingEntry {
  track: string;
  artist: string;
  app: string;
  timestamp: number;
}

interface GraphServiceDeps {
  getStore: () => any;
  getCurrentApp: () => string;
  getAllActivity: () => ActivityEntry[];
  getAllSnapshots: () => ContentSnapshot[];
  getLoadedActivity: () => ActivityEntry[];
  getActivityLog: () => ActivityEntry[];
  getLoadedSnapshots: () => ContentSnapshot[];
  getContentSnapshots: () => ContentSnapshot[];
  getClipboardLog: () => ClipboardEntry[];
  getNowPlayingLog: () => NowPlayingEntry[];
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  nia: NiaClient;
  persistedActivityMax: number;
  persistedSnapshotsMax: number;
}

class GraphService {
  private readonly deps: GraphServiceDeps;
  private readonly store = new EntityStore();
  private readonly lastAiExtractIndex = { value: 0 };

  constructor(deps: GraphServiceDeps) {
    this.deps = deps;
  }

  saveGraphToStore(): void {
    const configStore = this.deps.getStore();
    if (!configStore) return;

    try {
      const nodes = Array.from(this.store.nodes.values());
      const edges = Array.from(this.store.edges.entries()).map(([key, edge]) => ({ key, ...edge }));
      configStore.set('graphNodes', nodes);
      configStore.set('graphEdges', edges);

      const combinedActivity = [...this.deps.getLoadedActivity(), ...this.deps.getActivityLog()]
        .sort((a, b) => a.start - b.start)
        .slice(-this.deps.persistedActivityMax);

      const combinedSnapshots = [...this.deps.getLoadedSnapshots(), ...this.deps.getContentSnapshots()]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-this.deps.persistedSnapshotsMax);

      configStore.set('persistedActivity', combinedActivity);
      configStore.set(
        'persistedSnapshots',
        combinedSnapshots.map((snapshot) => ({
          timestamp: snapshot.timestamp,
          app: snapshot.app,
          title: snapshot.title,
          url: snapshot.url,
          text: snapshot.text.slice(0, 400),
          fullText: '',
          summary: snapshot.summary,
        }))
      );

      console.log(
        `[Enk] Graph saved: ${nodes.length} nodes, ${edges.length} edges; ${combinedActivity.length} activity, ${combinedSnapshots.length} snapshots`
      );
    } catch (err: any) {
      console.error('[Enk] Graph save failed:', err.message);
    }
  }

  loadGraphFromStore(): void {
    const configStore = this.deps.getStore();
    if (!configStore) return;

    try {
      const nodes: any[] = (configStore.get('graphNodes') as any[]) || [];
      const edges: { key: string; source: string; target: string; weight: number; relation?: string }[] =
        (configStore.get('graphEdges') as any[]) || [];

      for (const node of nodes) {
        this.store.nodes.set(node.id, {
          ...node,
          contexts: node.contexts || [],
          verified: node.verified || false,
        });
      }
      for (const edge of edges) {
        this.store.edges.set(edge.key, {
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          relation: edge.relation,
        });
      }

      if (nodes.length > 0) {
        console.log(`[Enk] Graph loaded: ${nodes.length} nodes, ${edges.length} edges`);
      }
    } catch (err: any) {
      console.error('[Enk] Graph load failed:', err.message);
    }
  }

  addEntity(label: string, type: EntityNode['type'], sourceContext?: string, contextHintForEdge?: string): void {
    this.store.addEntity(label, type, this.deps.getCurrentApp, sourceContext, contextHintForEdge);
  }

  extractEntitiesFromActivity(appName: string, title: string, url: string | null, summary: string | null): void {
    extractEntitiesFromActivity(this.store, this.deps.getCurrentApp, appName, title, url, summary);
  }

  async aiExtractEntities(): Promise<void> {
    await aiExtractEntities(this.store, this.deps, this.lastAiExtractIndex);
  }

  decayGraph(): void {
    decayGraph(this.store, () => this.saveGraphToStore());
  }

  async buildNiaEdges(): Promise<void> {
    await buildNiaEdges(this.store, this.deps.getStore, this.deps.nia, () => this.saveGraphToStore());
  }

  async cleanupGraph(): Promise<{ nodesRemoved: number; edgesRemoved: number }> {
    return cleanupGraph(this.store, this.deps.getStore, this.deps.claudeRequest, () => this.saveGraphToStore());
  }

  resetGraph(): void {
    this.store.reset();
    this.saveGraphToStore();
  }

  getGraphData(includeContext = false): { nodes: any[]; edges: any[] } {
    return getGraphData(this.store, this.deps, includeContext);
  }

  getNodeDetailData(nodeId: string): any {
    return getNodeDetailData(this.store, this.deps, nodeId);
  }

  getEdgeDetailData(sourceId: string, targetId: string): any {
    return getEdgeDetailData(this.store, this.deps, sourceId, targetId);
  }

  getEntityCount(): number {
    return this.store.nodes.size;
  }

  getNodeLabel(nodeId: string): string | null {
    return this.store.nodes.get(nodeId)?.label || null;
  }
}

function createGraphService(deps: GraphServiceDeps): GraphService {
  return new GraphService(deps);
}

export { createGraphService, GraphService };
