/**
 * Graph API - simplified factory that creates and manages a GraphService instance
 */
import type { NiaClient } from '../../nia-client';
import { createGraphService, type GraphService } from './service';
import type { 
  ActivityEntry, 
  ClaudeRequestBody, 
  ClaudeResponse, 
  ContentSnapshot,
  PersonEntity,
  ProjectEntity,
  SkillEntity,
  CurrentContext,
  UserModel,
  TaskBlock,
} from '../../types';

export interface GraphApiDeps {
  getStore: () => any;
  getCurrentApp: () => string;
  getAllActivity: () => ActivityEntry[];
  getAllSnapshots: () => ContentSnapshot[];
  getLoadedActivity: () => ActivityEntry[];
  getActivityLog: () => ActivityEntry[];
  getLoadedSnapshots: () => ContentSnapshot[];
  getContentSnapshots: () => ContentSnapshot[];
  getClipboardLog: () => { text: string; timestamp: number; app: string }[];
  getNowPlayingLog: () => { track: string; artist: string; app: string; timestamp: number }[];
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  nia: NiaClient;
  persistedActivityMax: number;
  persistedSnapshotsMax: number;
}

/**
 * Creates a graph API with lazy initialization of the GraphService
 */
export function createGraphApi(deps: GraphApiDeps) {
  let service: GraphService | null = null;

  const getService = (): GraphService => {
    if (!service) throw new Error('Graph service not initialized');
    return service;
  };

  return {
    initGraphService: () => {
      if (!service) service = createGraphService(deps);
    },
    
    // Persistence
    saveGraphToStore: () => getService().saveGraphToStore(),
    loadGraphFromStore: () => getService().loadGraphFromStore(),
    
    // Entity management
    addEntity: (label: string, type: any, sourceContext?: string, contextHint?: string) => 
      getService().addEntity(label, type, sourceContext, contextHint),
    extractEntitiesFromActivity: (app: string, title: string, url: string | null, summary: string | null) =>
      getService().extractEntitiesFromActivity(app, title, url, summary),
    aiExtractEntities: () => getService().aiExtractEntities(),
    
    // Graph maintenance
    decayGraph: () => getService().decayGraph(),
    buildNiaEdges: () => getService().buildNiaEdges(),
    cleanupGraph: () => getService().cleanupGraph(),
    resetGraph: () => getService().resetGraph(),
    
    // Queries
    getGraphData: (includeContext = false) => getService().getGraphData(includeContext),
    getNodeDetailData: (nodeId: string) => getService().getNodeDetailData(nodeId),
    getEdgeDetailData: (sourceId: string, targetId: string) => getService().getEdgeDetailData(sourceId, targetId),
    getEntityCount: () => getService().getEntityCount(),
    getNodeLabel: (nodeId: string) => getService().getNodeLabel(nodeId),
    
    // Enrichment
    recordActivitySignal: (app: string, url: string | null, durationMs: number) =>
      getService().recordActivitySignal(app, url, durationMs),
    recordEngagement: (entityId: string, durationMs: number) =>
      getService().recordEngagement(entityId, durationMs),
    enrichGraph: () => getService().enrichGraph(),
    decaySignals: () => getService().decaySignals(),
    getSignals: () => getService().getSignals(),
    getMetadata: () => getService().getMetadata(),
    getTopNodes: (n?: number) => getService().getTopNodes(n),
    getNodesByContext: (context: string) => getService().getNodesByContext(context),
    loadFullGraph: () => getService().loadFullGraph(),
    saveFullGraph: () => getService().saveFullGraph(),
    
    // === User Model API (primary interface for apps) ===
    
    /** Get complete user model - the main API for apps consuming context */
    getUserModel: (): UserModel => getService().getUserModel(),
    
    /** Get current context - what's happening right now */
    getCurrentContext: (): CurrentContext => getService().getCurrentContext(),
    
    /** Get top people the user interacts with */
    getTopPeople: (limit?: number): PersonEntity[] => getService().getTopPeople(limit),
    
    /** Get active projects */
    getActiveProjects: (limit?: number): ProjectEntity[] => getService().getActiveProjects(limit),
    
    /** Get user's expertise (skills, tools) */
    getExpertise: (limit?: number): SkillEntity[] => getService().getExpertise(limit),
    
    /** Get task blocks - activity grouped into coherent work sessions */
    getTaskBlocks: (limit?: number): TaskBlock[] => getService().getTaskBlocks(limit),
    
    /** Get timeline of tasks for a date range */
    getTimeline: (fromMs: number, toMs: number): TaskBlock[] => getService().getTimeline(fromMs, toMs),
    
    /** Find entities related to a given entity */
    getRelatedEntities: (entityId: string, limit?: number) => getService().getRelatedEntities(entityId, limit),
    
    /** Search entities by query */
    searchEntities: (query: string, limit?: number) => getService().searchEntities(query, limit),
    
    /** Get a summary of the user's day */
    getDaySummary: (dateMs?: number) => getService().getDaySummary(dateMs),
  };
}
