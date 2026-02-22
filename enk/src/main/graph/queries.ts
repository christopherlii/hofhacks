import type { ActivityEntry, ContentSnapshot } from '../../types';
import type { EntityStore } from './entity-store';

interface QueryDeps {
  getAllActivity: () => ActivityEntry[];
  getAllSnapshots: () => ContentSnapshot[];
  getClipboardLog: () => { text: string; timestamp: number; app: string }[];
  getNowPlayingLog: () => { track: string; artist: string; app: string; timestamp: number }[];
}

function getGraphData(store: EntityStore, deps: QueryDeps, includeContext = false): { nodes: any[]; edges: any[] } {
  const nodes = Array.from(store.nodes.values())
    .map((node) => ({ ...node, _score: node.weight * (node.verified ? 3 : 1) * Math.max(1, node.contexts.length) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 80);

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.from(store.edges.values())
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 200);

  const enrichedNodes = nodes.map((node) => {
    const base = {
      ...node,
      mentions: node.weight,
      contextDiversity: node.contexts?.length || 1,
      verified: node.verified || false,
    };

    if (includeContext) {
      return { ...base, context: getNodeContext(store, deps, node.id, node.label) };
    }
    return base;
  });

  const enrichedEdges = edges.map((edge) => {
    const sourceNode = store.nodes.get(edge.source);
    const targetNode = store.nodes.get(edge.target);
    return {
      ...edge,
      sourceLabel: sourceNode?.label || edge.source,
      targetLabel: targetNode?.label || edge.target,
      sourceType: sourceNode?.type || 'topic',
      targetType: targetNode?.type || 'topic',
    };
  });

  return { nodes: enrichedNodes, edges: enrichedEdges };
}

function getNodeDetailData(store: EntityStore, deps: QueryDeps, nodeId: string): any {
  const node = store.nodes.get(nodeId);
  if (!node) return null;

  const context = getNodeContext(store, deps, nodeId, node.label);
  const connectedEdges = Array.from(store.edges.values())
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 20);

  const connections = connectedEdges.map((edge) => {
    const otherId = edge.source === nodeId ? edge.target : edge.source;
    const other = store.nodes.get(otherId);
    return {
      id: otherId,
      label: other?.label || otherId,
      type: other?.type || 'topic',
      coOccurrences: edge.weight,
    };
  });

  return { ...node, mentions: node.weight, context, connections };
}

function getEdgeDetailData(store: EntityStore, deps: QueryDeps, sourceId: string, targetId: string): any {
  const edgeKey = [sourceId, targetId].sort().join('↔');
  const edge = store.edges.get(edgeKey);
  if (!edge) return null;

  const srcNode = store.nodes.get(sourceId);
  const tgtNode = store.nodes.get(targetId);
  const srcLabel = srcNode?.label?.toLowerCase() || '';
  const tgtLabel = tgtNode?.label?.toLowerCase() || '';

  const sharedActivity = deps
    .getAllActivity()
    .filter((activity) => {
      const haystack = `${activity.app} ${activity.title} ${activity.url || ''} ${activity.summary || ''}`.toLowerCase();
      return haystack.includes(srcLabel) || haystack.includes(tgtLabel);
    })
    .slice(-8)
    .map((activity) => ({
      app: activity.app,
      title: activity.title,
      url: activity.url,
      start: activity.start,
      duration: activity.duration,
      summary: activity.summary,
    }));

  return {
    source: { id: sourceId, label: srcNode?.label, type: srcNode?.type },
    target: { id: targetId, label: tgtNode?.label, type: tgtNode?.type },
    weight: edge.weight,
    sharedActivity,
  };
}

function getNodeContext(store: EntityStore, deps: QueryDeps, nodeId: string, nodeLabel: string): any {
  const label = nodeLabel.toLowerCase();
  const relatedActivity = deps
    .getAllActivity()
    .filter(
      (entry) =>
        entry.app.toLowerCase().includes(label) ||
        entry.title.toLowerCase().includes(label) ||
        (entry.url && entry.url.toLowerCase().includes(label)) ||
        (entry.summary && entry.summary.toLowerCase().includes(label))
    )
    .slice(-8)
    .map((entry) => ({
      app: entry.app,
      title: entry.title,
      url: entry.url,
      start: entry.start,
      end: entry.end,
      duration: entry.duration,
      summary: entry.summary,
    }));

  const relatedContent = deps
    .getAllSnapshots()
    .filter(
      (snapshot) =>
        snapshot.app.toLowerCase().includes(label) ||
        snapshot.title.toLowerCase().includes(label) ||
        snapshot.text.toLowerCase().includes(label) ||
        (snapshot.summary && snapshot.summary.toLowerCase().includes(label))
    )
    .slice(-5)
    .map((snapshot) => ({
      timestamp: snapshot.timestamp,
      app: snapshot.app,
      title: snapshot.title,
      summary: snapshot.summary,
      textPreview: snapshot.text.slice(0, 200),
    }));

  const relatedClipboard = deps
    .getClipboardLog()
    .filter((entry) => entry.text.toLowerCase().includes(label))
    .slice(-5)
    .map((entry) => ({ text: entry.text.slice(0, 150), timestamp: entry.timestamp, app: entry.app }));

  const relatedMusic = deps
    .getNowPlayingLog()
    .filter((entry) => entry.track.toLowerCase().includes(label) || entry.artist.toLowerCase().includes(label))
    .slice(-5);

  return { relatedActivity, relatedContent, relatedClipboard, relatedMusic };
}

export { getGraphData, getNodeDetailData, getEdgeDetailData };
