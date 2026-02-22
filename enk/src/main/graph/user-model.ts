/**
 * User Model Computation
 * 
 * Transforms the entity graph into semantic structures that apps actually want:
 * - Who does this person work with?
 * - What projects are they working on?
 * - What are they good at?
 * - How do they work?
 * 
 * This is the primary API surface for apps consuming the context engine.
 */

import type {
  EntityNode,
  EntityEdge,
  ActivitySignals,
  GraphMetadata,
  PersonEntity,
  ProjectEntity,
  SkillEntity,
  CurrentContext,
  WorkPatterns,
  UserModel,
  TaskBlock,
  RelationshipType,
  ContextType,
  ActivityEntry,
  ContentSnapshot,
} from '../../types';
import { EntityStore } from './entity-store';

// --- Relationship Inference ---

function inferRelationship(
  personNode: EntityNode,
  edges: EntityEdge[],
  allNodes: Map<string, EntityNode>
): RelationshipType {
  // Check edge relations for explicit relationship
  for (const edge of edges) {
    if (edge.relation) {
      const rel = edge.relation.toLowerCase();
      if (rel.includes('collaborat') || rel.includes('working_with')) return 'collaborator';
      if (rel.includes('manage') || rel.includes('report')) return 'manager';
      if (rel.includes('mentor') || rel.includes('learn')) return 'mentor';
      if (rel.includes('friend')) return 'friend';
    }
  }
  
  // Infer from context
  if (personNode.primaryContext === 'work') {
    // Check if connected to projects
    const hasProjectConnection = edges.some(e => {
      const otherId = e.source === personNode.id ? e.target : e.source;
      const other = allNodes.get(otherId);
      return other?.type === 'project';
    });
    return hasProjectConnection ? 'collaborator' : 'contact';
  }
  
  if (personNode.primaryContext === 'social') return 'friend';
  
  return 'unknown';
}

function getConnectedEdges(nodeId: string, edges: Map<string, EntityEdge>): EntityEdge[] {
  return Array.from(edges.values()).filter(
    e => e.source === nodeId || e.target === nodeId
  );
}

function getConnectedNodeIds(nodeId: string, edges: EntityEdge[]): string[] {
  return edges.map(e => e.source === nodeId ? e.target : e.source);
}

// --- People Extraction ---

export function extractPeople(
  store: EntityStore,
  signals: ActivitySignals,
  limit: number = 20
): PersonEntity[] {
  const people: PersonEntity[] = [];
  
  for (const [id, node] of store.nodes) {
    if (node.type !== 'person') continue;
    
    const edges = getConnectedEdges(id, store.edges);
    const connectedIds = getConnectedNodeIds(id, edges);
    
    // Find communication channels (apps this person appears in)
    const channels = new Set<string>();
    for (const ctx of node.contexts) {
      const ctxLower = ctx.toLowerCase();
      if (ctxLower.includes('slack')) channels.add('slack');
      if (ctxLower.includes('email') || ctxLower.includes('gmail')) channels.add('email');
      if (ctxLower.includes('message') || ctxLower.includes('imessage')) channels.add('messages');
      if (ctxLower.includes('telegram')) channels.add('telegram');
      if (ctxLower.includes('discord')) channels.add('discord');
      if (ctxLower.includes('whatsapp')) channels.add('whatsapp');
      if (ctxLower.includes('teams')) channels.add('teams');
      if (ctxLower.includes('zoom')) channels.add('zoom');
    }
    
    // Find shared projects
    const sharedProjects = connectedIds.filter(cid => {
      const connected = store.nodes.get(cid);
      return connected?.type === 'project';
    });
    
    const engagement = signals.entityEngagement[id];
    
    people.push({
      id,
      name: node.label,
      relationship: inferRelationship(node, edges, store.nodes),
      context: node.primaryContext || 'unknown',
      lastInteraction: node.lastSeen,
      interactionCount: engagement?.sessions || node.weight,
      communicationChannels: Array.from(channels),
      sharedProjects,
      salience: node.salience || 0,
    });
  }
  
  // Sort by salience, then recency
  people.sort((a, b) => {
    const salienceDiff = b.salience - a.salience;
    if (Math.abs(salienceDiff) > 0.1) return salienceDiff;
    return b.lastInteraction - a.lastInteraction;
  });
  
  return people.slice(0, limit);
}

// --- Project Extraction ---

function inferProjectStatus(
  node: EntityNode,
  engagement: { totalMs: number; recentMs: number; lastSeen: number } | undefined
): 'active' | 'paused' | 'completed' | 'unknown' {
  if (!engagement) return 'unknown';
  
  const now = Date.now();
  const daysSinceLast = (now - engagement.lastSeen) / (24 * 60 * 60 * 1000);
  
  // Active if touched in last 3 days with recent engagement
  if (daysSinceLast < 3 && engagement.recentMs > 30 * 60 * 1000) return 'active';
  
  // Paused if not touched in 3-14 days
  if (daysSinceLast >= 3 && daysSinceLast < 14) return 'paused';
  
  // Could be completed or abandoned after 14 days
  if (daysSinceLast >= 14) return 'completed';
  
  return 'active';
}

export function extractProjects(
  store: EntityStore,
  signals: ActivitySignals,
  limit: number = 15
): ProjectEntity[] {
  const projects: ProjectEntity[] = [];
  
  for (const [id, node] of store.nodes) {
    if (node.type !== 'project') continue;
    
    const edges = getConnectedEdges(id, store.edges);
    const connectedIds = getConnectedNodeIds(id, edges);
    
    // Find related people
    const relatedPeople = connectedIds.filter(cid => {
      const connected = store.nodes.get(cid);
      return connected?.type === 'person';
    });
    
    // Find related tools/apps
    const relatedTools = connectedIds.filter(cid => {
      const connected = store.nodes.get(cid);
      return connected?.type === 'app' || connected?.type === 'skill';
    });
    
    const engagement = signals.entityEngagement[id];
    
    projects.push({
      id,
      name: node.label,
      status: inferProjectStatus(node, engagement),
      context: node.primaryContext || 'work',
      lastActivity: node.lastSeen,
      totalEngagementMs: engagement?.totalMs || 0,
      recentEngagementMs: engagement?.recentMs || 0,
      relatedPeople,
      relatedTools,
      salience: node.salience || 0,
    });
  }
  
  // Sort: active first, then by salience
  projects.sort((a, b) => {
    const statusOrder = { active: 0, paused: 1, unknown: 2, completed: 3 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return b.salience - a.salience;
  });
  
  return projects.slice(0, limit);
}

// --- Expertise Extraction ---

export function extractExpertise(
  store: EntityStore,
  signals: ActivitySignals,
  limit: number = 20
): SkillEntity[] {
  const skills: SkillEntity[] = [];
  
  for (const [id, node] of store.nodes) {
    if (node.type !== 'skill' && node.type !== 'app') continue;
    
    // Skip generic apps
    const skipApps = ['finder', 'system preferences', 'activity monitor', 'preview'];
    if (skipApps.includes(node.label.toLowerCase())) continue;
    
    const engagement = signals.entityEngagement[id];
    if (!engagement || engagement.totalMs < 10 * 60 * 1000) continue; // Min 10 min
    
    const edges = getConnectedEdges(id, store.edges);
    const connectedIds = getConnectedNodeIds(id, edges);
    
    // Find related projects
    const relatedProjects = connectedIds.filter(cid => {
      const connected = store.nodes.get(cid);
      return connected?.type === 'project';
    });
    
    skills.push({
      id,
      name: node.label,
      proficiency: node.proficiency || Math.min(1, engagement.totalMs / (50 * 60 * 60 * 1000)), // Max at 50 hours
      totalEngagementMs: engagement.totalMs,
      lastUsed: engagement.lastSeen,
      trend: node.engagementTrend || 'stable',
      relatedProjects,
    });
  }
  
  // Sort by proficiency
  skills.sort((a, b) => b.proficiency - a.proficiency);
  
  return skills.slice(0, limit);
}

// --- Work Patterns ---

export function computeWorkPatterns(
  metadata: GraphMetadata,
  signals: ActivitySignals,
  store: EntityStore
): WorkPatterns {
  // Compute avg focus block from session durations
  const sessions = signals.sessionDurations.filter(d => d > 5 * 60 * 1000); // Min 5 min
  const avgFocusBlockMs = sessions.length > 0
    ? sessions.reduce((a, b) => a + b, 0) / sessions.length
    : 0;
  
  // Determine primary work context
  let primaryWorkContext: ContextType = 'work';
  let maxMs = 0;
  for (const node of store.nodes.values()) {
    if (node.primaryContext && node.primaryContext !== 'unknown' && node.engagementMs) {
      if (node.engagementMs > maxMs) {
        maxMs = node.engagementMs;
        primaryWorkContext = node.primaryContext;
      }
    }
  }
  
  return {
    peakHours: metadata.peakHours,
    peakDays: metadata.peakDays,
    avgSessionMinutes: metadata.avgSessionMinutes,
    avgFocusBlockMinutes: Math.round(avgFocusBlockMs / 60000),
    contextSwitchRate: metadata.contextSwitchRate,
    primaryWorkContext,
    workLifeBalance: metadata.categoryDistribution as Record<ContextType, number>,
  };
}

// --- Current Context ---

export function computeCurrentContext(
  store: EntityStore,
  signals: ActivitySignals,
  recentActivity: ActivityEntry[],
  currentApp: string
): CurrentContext {
  const now = Date.now();
  
  // Find most recent activity
  const recent = recentActivity.slice(-5);
  const lastActivity = recent[recent.length - 1];
  
  // Infer task from recent activity
  let task = 'Unknown activity';
  let intent: CurrentContext['intent'] = 'unknown';
  
  if (lastActivity) {
    // Use title and app to infer task
    const title = lastActivity.title || '';
    const app = lastActivity.app || currentApp;
    
    // Infer intent
    const lowerTitle = title.toLowerCase();
    const lowerApp = app.toLowerCase();
    
    if (lowerApp.includes('vscode') || lowerApp.includes('xcode') || lowerApp.includes('terminal')) {
      intent = 'creating';
      task = `Coding: ${title.slice(0, 50)}`;
    } else if (lowerApp.includes('slack') || lowerApp.includes('message') || lowerApp.includes('telegram') || lowerApp.includes('discord')) {
      intent = 'communicating';
      task = `Messaging: ${title.slice(0, 40)}`;
    } else if (lowerTitle.includes('search') || lowerTitle.includes('google') || lowerApp.includes('safari') || lowerApp.includes('chrome')) {
      intent = 'researching';
      task = `Browsing: ${title.slice(0, 50)}`;
    } else if (lowerApp.includes('youtube') || lowerApp.includes('netflix') || lowerApp.includes('spotify')) {
      intent = 'consuming';
      task = `Watching/Listening: ${title.slice(0, 40)}`;
    } else if (lowerApp.includes('figma') || lowerApp.includes('notion') || lowerApp.includes('docs')) {
      intent = 'creating';
      task = `Working in ${app}: ${title.slice(0, 40)}`;
    } else {
      task = `${app}: ${title.slice(0, 50)}`;
    }
  }
  
  // Find related project
  const topProjects = extractProjects(store, signals, 3);
  const activeProject = topProjects.find(p => p.status === 'active') || null;
  
  // Find people involved in recent activity
  const recentPeople = extractPeople(store, signals, 5).filter(p => {
    const daysSinceLast = (now - p.lastInteraction) / (24 * 60 * 60 * 1000);
    return daysSinceLast < 1; // Active today
  });
  
  // Compute focus depth from context switches
  const recentSwitches = signals.switchTimestamps.filter(t => t > now - 30 * 60 * 1000).length;
  const focusDepth = Math.max(0, 1 - (recentSwitches / 10)); // 10+ switches = 0 focus
  
  // Context started = last switch or session start
  const contextStarted = signals.switchTimestamps.length > 0
    ? signals.switchTimestamps[signals.switchTimestamps.length - 1]
    : now - 30 * 60 * 1000;
  
  return {
    app: currentApp,
    task,
    intent,
    focusDepth,
    activeProject,
    activePeople: recentPeople,
    contextStarted,
    contextDurationMs: now - contextStarted,
    confidence: recentActivity.length > 3 ? 'high' : recentActivity.length > 0 ? 'medium' : 'low',
  };
}

// --- Task Block Detection ---

const TASK_GAP_MS = 5 * 60 * 1000; // 5 min gap = new task

export function detectTaskBlocks(
  activity: ActivityEntry[],
  store: EntityStore,
  limit: number = 20
): TaskBlock[] {
  if (activity.length === 0) return [];
  
  const blocks: TaskBlock[] = [];
  let currentBlock: {
    entries: ActivityEntry[];
    apps: Set<string>;
    start: number;
    end: number;
  } | null = null;
  
  // Sort by start time
  const sorted = [...activity].sort((a, b) => a.start - b.start);
  
  for (const entry of sorted) {
    if (!currentBlock) {
      currentBlock = {
        entries: [entry],
        apps: new Set([entry.app]),
        start: entry.start,
        end: entry.end,
      };
      continue;
    }
    
    // Check if this entry is part of the same block
    const gap = entry.start - currentBlock.end;
    
    if (gap < TASK_GAP_MS) {
      // Same block
      currentBlock.entries.push(entry);
      currentBlock.apps.add(entry.app);
      currentBlock.end = Math.max(currentBlock.end, entry.end);
    } else {
      // New block - save current
      blocks.push(buildTaskBlock(currentBlock, store));
      currentBlock = {
        entries: [entry],
        apps: new Set([entry.app]),
        start: entry.start,
        end: entry.end,
      };
    }
  }
  
  // Don't forget the last block
  if (currentBlock) {
    blocks.push(buildTaskBlock(currentBlock, store));
  }
  
  // Return most recent first
  return blocks.reverse().slice(0, limit);
}

function buildTaskBlock(
  raw: { entries: ActivityEntry[]; apps: Set<string>; start: number; end: number },
  store: EntityStore
): TaskBlock {
  const id = `task-${raw.start}`;
  const apps = Array.from(raw.apps);
  
  // Infer label from dominant activity
  const appCounts: Record<string, number> = {};
  let totalDuration = 0;
  for (const entry of raw.entries) {
    appCounts[entry.app] = (appCounts[entry.app] || 0) + entry.duration;
    totalDuration += entry.duration;
  }
  
  const dominantApp = Object.entries(appCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
  const lastTitle = raw.entries[raw.entries.length - 1]?.title || '';
  
  // Infer intent
  let intent = 'unknown';
  const lowerApp = dominantApp.toLowerCase();
  if (lowerApp.includes('vscode') || lowerApp.includes('terminal') || lowerApp.includes('xcode')) {
    intent = 'coding';
  } else if (lowerApp.includes('slack') || lowerApp.includes('message') || lowerApp.includes('mail')) {
    intent = 'communicating';
  } else if (lowerApp.includes('chrome') || lowerApp.includes('safari') || lowerApp.includes('firefox')) {
    intent = 'researching';
  } else if (lowerApp.includes('figma') || lowerApp.includes('notion')) {
    intent = 'designing';
  }
  
  const label = `${dominantApp}: ${lastTitle.slice(0, 50) || intent}`;
  
  // Find related entities from the store
  const entityIds = new Set<string>();
  const peopleIds = new Set<string>();
  let projectId: string | null = null;
  
  for (const entry of raw.entries) {
    const haystack = `${entry.app} ${entry.title} ${entry.url || ''} ${entry.summary || ''}`.toLowerCase();
    
    for (const [nodeId, node] of store.nodes) {
      const nodeLower = node.label.toLowerCase();
      if (haystack.includes(nodeLower)) {
        entityIds.add(nodeId);
        if (node.type === 'person') peopleIds.add(nodeId);
        if (node.type === 'project' && !projectId) projectId = nodeId;
      }
    }
  }
  
  // Focus score: fewer context switches = higher focus
  const switchCount = apps.length - 1;
  const focusScore = Math.max(0, 1 - (switchCount / 5));
  
  return {
    id,
    label,
    intent,
    startTime: raw.start,
    endTime: raw.end,
    durationMs: raw.end - raw.start,
    apps,
    entities: Array.from(entityIds),
    project: projectId,
    people: Array.from(peopleIds),
    focusScore,
    confidence: raw.entries.length > 3 ? 'high' : raw.entries.length > 1 ? 'medium' : 'low',
  };
}

// --- Full User Model ---

export function computeUserModel(
  store: EntityStore,
  signals: ActivitySignals,
  metadata: GraphMetadata,
  recentActivity: ActivityEntry[],
  currentApp: string
): UserModel {
  const topPeople = extractPeople(store, signals, 15);
  const activeProjects = extractProjects(store, signals, 10);
  const expertise = extractExpertise(store, signals, 15);
  const workPatterns = computeWorkPatterns(metadata, signals, store);
  
  // Current focus
  const focusNodes = metadata.currentFocus.slice(0, 5);
  const focusLabels = focusNodes.map(id => store.nodes.get(id)?.label || id);
  
  // Data quality based on total engagement
  const totalHours = signals.totalActivityMs / (60 * 60 * 1000);
  let dataQuality: 'sparse' | 'moderate' | 'rich' = 'sparse';
  if (totalHours > 10) dataQuality = 'moderate';
  if (totalHours > 50) dataQuality = 'rich';
  
  return {
    topPeople,
    activeProjects,
    expertise,
    workPatterns,
    currentFocus: {
      task: focusLabels.join(', ') || 'No current focus detected',
      entities: focusNodes,
      confidence: dataQuality === 'sparse' ? 'low' : dataQuality === 'moderate' ? 'medium' : 'high',
    },
    lastUpdated: Date.now(),
    dataQuality,
  };
}
