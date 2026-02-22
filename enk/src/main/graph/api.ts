/**
 * Graph API - simplified factory that creates and manages a GraphService instance
 */
import type { NiaClient } from '../../nia-client';
import { createGraphService, type GraphService } from './service';
import type { ActivityEntry, ClaudeRequestBody, ClaudeResponse, ContentSnapshot } from '../../types';

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
  };
}
