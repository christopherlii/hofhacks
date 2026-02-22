import type { NiaClient } from '../../nia-client';
import { createGraphService, type GraphService } from './service';
import type { ActivityEntry, ClaudeRequestBody, ClaudeResponse, ContentSnapshot } from '../../types';

interface CreateGraphApiDeps {
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

function createGraphApi(deps: CreateGraphApiDeps) {
  let graphService: GraphService | null = null;

  function getGraphService(): GraphService {
    if (!graphService) {
      throw new Error('Graph service not initialized');
    }
    return graphService;
  }

  function initGraphService(): void {
    if (graphService) return;

    graphService = createGraphService({
      getStore: deps.getStore,
      getCurrentApp: deps.getCurrentApp,
      getAllActivity: deps.getAllActivity,
      getAllSnapshots: deps.getAllSnapshots,
      getLoadedActivity: deps.getLoadedActivity,
      getActivityLog: deps.getActivityLog,
      getLoadedSnapshots: deps.getLoadedSnapshots,
      getContentSnapshots: deps.getContentSnapshots,
      getClipboardLog: deps.getClipboardLog,
      getNowPlayingLog: deps.getNowPlayingLog,
      claudeRequest: deps.claudeRequest,
      nia: deps.nia,
      persistedActivityMax: deps.persistedActivityMax,
      persistedSnapshotsMax: deps.persistedSnapshotsMax,
    });
  }

  function saveGraphToStore(): void {
    getGraphService().saveGraphToStore();
  }

  function loadGraphFromStore(): void {
    getGraphService().loadGraphFromStore();
  }

  function decayGraph(): void {
    getGraphService().decayGraph();
  }

  function addEntity(label: string, type: any, sourceContext?: string, contextHintForEdge?: string): void {
    getGraphService().addEntity(label, type, sourceContext, contextHintForEdge);
  }

  function extractEntitiesFromActivity(appName: string, title: string, url: string | null, summary: string | null): void {
    getGraphService().extractEntitiesFromActivity(appName, title, url, summary);
  }

  async function aiExtractEntities(): Promise<void> {
    await getGraphService().aiExtractEntities();
  }

  async function buildNiaEdges(): Promise<void> {
    await getGraphService().buildNiaEdges();
  }

  async function cleanupGraph(): Promise<void> {
    await getGraphService().cleanupGraph();
  }

  function getGraphData(includeContext = false): { nodes: any[]; edges: any[] } {
    return getGraphService().getGraphData(includeContext);
  }

  function getNodeDetailData(nodeId: string): any {
    return getGraphService().getNodeDetailData(nodeId);
  }

  function getEdgeDetailData(sourceId: string, targetId: string): any {
    return getGraphService().getEdgeDetailData(sourceId, targetId);
  }

  function getEntityCount(): number {
    return getGraphService().getEntityCount();
  }

  function getNodeLabel(nodeId: string): string | null {
    return getGraphService().getNodeLabel(nodeId);
  }

  return {
    initGraphService,
    saveGraphToStore,
    loadGraphFromStore,
    decayGraph,
    addEntity,
    extractEntitiesFromActivity,
    aiExtractEntities,
    buildNiaEdges,
    cleanupGraph,
    getGraphData,
    getNodeDetailData,
    getEdgeDetailData,
    getEntityCount,
    getNodeLabel,
  };
}

export { createGraphApi };
