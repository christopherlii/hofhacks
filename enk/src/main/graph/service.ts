import type { NiaClient } from '../../nia-client';
import type { 
  ActivityEntry, 
  ActivitySignals, 
  GraphMetadata, 
  ClaudeRequestBody, 
  ClaudeResponse, 
  ContentSnapshot, 
  EntityNode,
  PersonEntity,
  ProjectEntity,
  SkillEntity,
  CurrentContext,
  UserModel,
  TaskBlock,
} from '../../types';
import { EntityStore } from './entity-store';
import { aiExtractEntities, extractEntitiesFromActivity } from './extraction';
import { 
  createEmptySignals,
  createEmptyMetadata,
  recordEngagement,
  recordSession,
  recordSwitch,
  inferContext,
  enrichGraph,
  decayEngagement
} from './enrichment';
import { buildNiaEdges, cleanupGraph, decayGraph } from './maintenance';
import { getEdgeDetailData, getGraphData, getNodeDetailData } from './queries';
import {
  extractPeople,
  extractProjects,
  extractExpertise,
  computeCurrentContext,
  computeUserModel,
  detectTaskBlocks,
} from './user-model';

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
  private signals: ActivitySignals = createEmptySignals();
  private metadata: GraphMetadata = createEmptyMetadata();
  private lastEnrichment = 0;

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

  // --- Enrichment Methods ---

  /**
   * Record engagement with an entity
   */
  recordEngagement(entityId: string, durationMs: number): void {
    recordEngagement(this.signals, entityId, durationMs);
  }

  /**
   * Record activity signal (creates entity engagement + tracks temporal patterns)
   */
  recordActivitySignal(app: string, url: string | null, durationMs: number): void {
    // Record for app entity
    const appId = `app:${app.toLowerCase().replace(/[^\w]/g, '')}`;
    recordEngagement(this.signals, appId, durationMs);
    
    // Record for URL domain if present
    if (url) {
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        const domainId = `content:${domain.replace(/[^\w.]/g, '')}`;
        recordEngagement(this.signals, domainId, durationMs);
      } catch {
        // Invalid URL, skip
      }
    }
    
    // Record session
    recordSession(this.signals, durationMs);
    
    // Record context switch
    recordSwitch(this.signals);
  }

  /**
   * Enrich the graph with computed properties (run periodically)
   */
  enrichGraph(): GraphMetadata {
    const now = Date.now();
    
    // Rate limit: at most once per 5 minutes
    if (now - this.lastEnrichment < 5 * 60 * 1000) {
      return this.metadata;
    }
    
    this.lastEnrichment = now;
    this.metadata = enrichGraph(this.store, this.signals);
    
    console.log(`[Enk] Graph enriched: ${this.metadata.currentFocus.length} focus nodes, ` +
      `peak hours: ${this.metadata.peakHours.slice(0, 3).join(',')}`);
    
    return this.metadata;
  }

  /**
   * Decay old engagement signals
   */
  decaySignals(): void {
    decayEngagement(this.signals);
  }

  /**
   * Get current activity signals
   */
  getSignals(): ActivitySignals {
    return { ...this.signals };
  }

  /**
   * Get graph metadata (user context summary)
   */
  getMetadata(): GraphMetadata {
    return { ...this.metadata };
  }

  /**
   * Get top nodes by salience (current focus)
   */
  getTopNodes(n: number = 10): EntityNode[] {
    return Array.from(this.store.nodes.values())
      .filter(node => node.salience && node.salience > 0)
      .sort((a, b) => (b.salience || 0) - (a.salience || 0))
      .slice(0, n);
  }

  /**
   * Get nodes by context
   */
  getNodesByContext(context: string): EntityNode[] {
    return Array.from(this.store.nodes.values())
      .filter(node => node.primaryContext === context)
      .sort((a, b) => (b.salience || 0) - (a.salience || 0));
  }

  /**
   * Save graph + signals + metadata
   */
  saveFullGraph(): void {
    const configStore = this.deps.getStore();
    if (!configStore) return;
    
    this.saveGraphToStore();
    
    try {
      configStore.set('activitySignals', this.signals);
      configStore.set('graphMetadata', this.metadata);
      console.log(`[Enk] Full graph saved: ${this.signals.totalActivityMs / 60000}min tracked`);
    } catch (err: any) {
      console.error('[Enk] Signals/metadata save failed:', err.message);
    }
  }

  /**
   * Load graph + signals + metadata
   */
  loadFullGraph(): void {
    const configStore = this.deps.getStore();
    if (!configStore) return;
    
    this.loadGraphFromStore();
    
    try {
      const savedSignals = configStore.get('activitySignals') as ActivitySignals | undefined;
      const savedMetadata = configStore.get('graphMetadata') as GraphMetadata | undefined;
      
      if (savedSignals) {
        this.signals = savedSignals;
        console.log(`[Enk] Signals loaded: ${Math.round(this.signals.totalActivityMs / 60000)}min total`);
      }
      
      if (savedMetadata) {
        this.metadata = savedMetadata;
      }
    } catch (err: any) {
      console.error('[Enk] Signals/metadata load failed:', err.message);
    }
  }

  // =============================================================================
  // USER MODEL API - The primary interface for apps consuming context
  // =============================================================================

  /**
   * Get the complete user model - the main API for apps
   * 
   * Returns:
   * - topPeople: Who they work with, with relationship context
   * - activeProjects: What they're working on
   * - expertise: What they know (skills/tools)
   * - workPatterns: How they work
   * - currentFocus: What they're focused on now
   */
  getUserModel(): UserModel {
    return computeUserModel(
      this.store,
      this.signals,
      this.metadata,
      this.deps.getAllActivity(),
      this.deps.getCurrentApp()
    );
  }

  /**
   * Get current context - what's happening right now
   * 
   * Returns intent, focus depth, active project, people involved
   */
  getCurrentContext(): CurrentContext {
    return computeCurrentContext(
      this.store,
      this.signals,
      this.deps.getAllActivity(),
      this.deps.getCurrentApp()
    );
  }

  /**
   * Get top people the user interacts with
   */
  getTopPeople(limit: number = 15): PersonEntity[] {
    return extractPeople(this.store, this.signals, limit);
  }

  /**
   * Get active projects
   */
  getActiveProjects(limit: number = 10): ProjectEntity[] {
    return extractProjects(this.store, this.signals, limit);
  }

  /**
   * Get user's expertise (skills, tools, languages)
   */
  getExpertise(limit: number = 15): SkillEntity[] {
    return extractExpertise(this.store, this.signals, limit);
  }

  /**
   * Get task blocks - activity grouped into coherent work sessions
   * 
   * Returns labeled task blocks like "Working on Enk context engine"
   * instead of raw activity entries
   */
  getTaskBlocks(limit: number = 20): TaskBlock[] {
    return detectTaskBlocks(this.deps.getAllActivity(), this.store, limit);
  }

  /**
   * Get timeline of tasks for a date range
   */
  getTimeline(fromMs: number, toMs: number): TaskBlock[] {
    const allActivity = this.deps.getAllActivity();
    const filtered = allActivity.filter(a => a.start >= fromMs && a.end <= toMs);
    return detectTaskBlocks(filtered, this.store, 100);
  }

  /**
   * Find entities related to a given entity
   * Returns semantically related entities, not just co-occurring
   */
  getRelatedEntities(entityId: string, limit: number = 10): EntityNode[] {
    const node = this.store.nodes.get(entityId);
    if (!node) return [];

    // Find connected via edges
    const connected = new Map<string, { node: EntityNode; weight: number; relation?: string }>();
    
    for (const [, edge] of this.store.edges) {
      if (edge.source === entityId || edge.target === entityId) {
        const otherId = edge.source === entityId ? edge.target : edge.source;
        const otherNode = this.store.nodes.get(otherId);
        if (otherNode) {
          const existing = connected.get(otherId);
          const weight = edge.weight + (edge.relation ? 5 : 0); // Bonus for semantic relation
          if (!existing || existing.weight < weight) {
            connected.set(otherId, { node: otherNode, weight, relation: edge.relation });
          }
        }
      }
    }

    // Sort by weight (relationship strength)
    const sorted = Array.from(connected.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);

    return sorted.map(s => s.node);
  }

  /**
   * Search entities by query
   */
  searchEntities(query: string, limit: number = 20): EntityNode[] {
    const lowerQuery = query.toLowerCase();
    const results: { node: EntityNode; score: number }[] = [];

    for (const [, node] of this.store.nodes) {
      const labelLower = node.label.toLowerCase();
      
      let score = 0;
      if (labelLower === lowerQuery) {
        score = 100;
      } else if (labelLower.startsWith(lowerQuery)) {
        score = 80;
      } else if (labelLower.includes(lowerQuery)) {
        score = 60;
      } else {
        continue;
      }

      // Boost by salience
      score += (node.salience || 0) * 20;

      results.push({ node, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.node);
  }

  /**
   * Get a summary of the user's day
   */
  getDaySummary(dateMs?: number): {
    date: string;
    totalActiveMs: number;
    topApps: { app: string; durationMs: number }[];
    topProjects: ProjectEntity[];
    topPeople: PersonEntity[];
    taskBlocks: TaskBlock[];
    focusScore: number;
  } {
    const targetDate = dateMs ? new Date(dateMs) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const dayActivity = this.deps.getAllActivity().filter(
      a => a.start >= startOfDay.getTime() && a.end <= endOfDay.getTime()
    );

    // Compute app durations
    const appDurations: Record<string, number> = {};
    let totalActiveMs = 0;
    for (const entry of dayActivity) {
      appDurations[entry.app] = (appDurations[entry.app] || 0) + entry.duration;
      totalActiveMs += entry.duration;
    }

    const topApps = Object.entries(appDurations)
      .map(([app, durationMs]) => ({ app, durationMs }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    const taskBlocks = detectTaskBlocks(dayActivity, this.store, 50);

    // Focus score: based on context switches vs work time
    const workBlocks = taskBlocks.filter(t => t.durationMs > 10 * 60 * 1000);
    const avgFocusScore = workBlocks.length > 0
      ? workBlocks.reduce((sum, t) => sum + t.focusScore, 0) / workBlocks.length
      : 0;

    return {
      date: targetDate.toISOString().split('T')[0],
      totalActiveMs,
      topApps,
      topProjects: this.getActiveProjects(3),
      topPeople: this.getTopPeople(5),
      taskBlocks,
      focusScore: avgFocusScore,
    };
  }
}

function createGraphService(deps: GraphServiceDeps): GraphService {
  return new GraphService(deps);
}

export { createGraphService, GraphService };
