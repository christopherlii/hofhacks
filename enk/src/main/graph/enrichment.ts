/**
 * Graph Enrichment - Enriches entity nodes with context and computes graph metadata
 * 
 * This module transforms raw entity tracking into meaningful context by:
 * 1. Tracking engagement signals per entity
 * 2. Computing node properties (salience, role, trend, context)
 * 3. Maintaining graph-level metadata
 * 
 * The result: One graph where structure and attributes encode user understanding
 */

import type { 
  ActivitySignals, 
  GraphMetadata,
  EntityNode,
  EntityEdge,
  UserRole,
  EngagementTrend,
  ContextType
} from '../../types';
import { EntityStore } from './entity-store';

// --- Signal Initialization ---

export function createEmptySignals(): ActivitySignals {
  return {
    entityEngagement: {},
    hourlyActivity: new Array(24).fill(0),
    dailyActivity: new Array(7).fill(0),
    sessionDurations: [],
    switchTimestamps: [],
    totalActivityMs: 0,
    lastUpdated: Date.now(),
  };
}

export function createEmptyMetadata(): GraphMetadata {
  return {
    peakHours: [],
    peakDays: [],
    currentFocus: [],
    avgSessionMinutes: 0,
    contextSwitchRate: 0,
    categoryDistribution: {},
    lastUpdated: Date.now(),
    totalEngagementMs: 0,
  };
}

// --- Signal Recording ---

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function recordEngagement(
  signals: ActivitySignals,
  entityId: string,
  durationMs: number,
  timestamp: number = Date.now()
): void {
  // Update entity engagement
  const existing = signals.entityEngagement[entityId];
  if (existing) {
    existing.totalMs += durationMs;
    existing.sessions += 1;
    existing.lastSeen = timestamp;
    // Update recent engagement (rolling 7-day window)
    if (timestamp - existing.lastSeen < SEVEN_DAYS_MS) {
      existing.recentMs += durationMs;
    }
  } else {
    signals.entityEngagement[entityId] = {
      totalMs: durationMs,
      sessions: 1,
      lastSeen: timestamp,
      recentMs: durationMs,
    };
  }
  
  // Update temporal patterns
  const date = new Date(timestamp);
  signals.hourlyActivity[date.getHours()]++;
  signals.dailyActivity[date.getDay()]++;
  
  // Update totals
  signals.totalActivityMs += durationMs;
  signals.lastUpdated = timestamp;
}

export function recordSession(signals: ActivitySignals, durationMs: number): void {
  signals.sessionDurations.push(durationMs);
  // Keep last 100 sessions
  if (signals.sessionDurations.length > 100) {
    signals.sessionDurations = signals.sessionDurations.slice(-100);
  }
}

export function recordSwitch(signals: ActivitySignals, timestamp: number = Date.now()): void {
  signals.switchTimestamps.push(timestamp);
  // Keep last hour
  const oneHourAgo = timestamp - 60 * 60 * 1000;
  signals.switchTimestamps = signals.switchTimestamps.filter(t => t > oneHourAgo);
}

// --- Context Classification ---

const APP_CONTEXTS: Record<string, ContextType> = {
  // Work
  'VSCode': 'work', 'Visual Studio Code': 'work', 'Xcode': 'work',
  'IntelliJ': 'work', 'Terminal': 'work', 'iTerm': 'work',
  'Slack': 'work', 'Linear': 'work', 'Notion': 'work',
  'Figma': 'work', 'Zoom': 'work', 'Teams': 'work',
  
  // Learning
  'Safari': 'learning', 'Chrome': 'learning', // Default for browsers
  
  // Social
  'Messages': 'social', 'Telegram': 'social', 'WhatsApp': 'social',
  'Discord': 'social', 'Twitter': 'social',
  
  // Entertainment
  'Spotify': 'entertainment', 'Music': 'entertainment',
  'Netflix': 'entertainment', 'YouTube': 'entertainment',
};

const URL_CONTEXTS: Record<string, ContextType> = {
  'github.com': 'work',
  'stackoverflow.com': 'learning',
  'docs.': 'learning',
  'youtube.com': 'entertainment',
  'twitter.com': 'social',
  'x.com': 'social',
  'linkedin.com': 'work',
  'reddit.com': 'entertainment',
  'netflix.com': 'entertainment',
  'notion.so': 'work',
  'figma.com': 'work',
  'medium.com': 'learning',
  'udemy.com': 'learning',
  'coursera.org': 'learning',
};

export function inferContext(app: string | null, url: string | null): ContextType {
  // URL takes precedence
  if (url) {
    const lower = url.toLowerCase();
    for (const [pattern, context] of Object.entries(URL_CONTEXTS)) {
      if (lower.includes(pattern)) return context;
    }
  }
  
  // Then app
  if (app && APP_CONTEXTS[app]) {
    return APP_CONTEXTS[app];
  }
  
  return 'unknown';
}

// --- Role Inference ---

export function inferRole(
  node: EntityNode,
  engagement: { totalMs: number; sessions: number } | undefined,
  hasCreatedContent: boolean
): UserRole {
  if (!engagement) return 'unknown';
  
  // If they created it, they're a creator
  if (hasCreatedContent || node.type === 'project') {
    // Check if they're actively working on it
    if (engagement.sessions > 5 && engagement.totalMs > 60 * 60 * 1000) {
      return 'creator';
    }
  }
  
  // High engagement = likely working with it
  if (node.type === 'person') {
    return engagement.sessions > 3 ? 'collaborator' : 'viewer';
  }
  
  if (node.type === 'topic' || node.type === 'skill') {
    // Learning vs using
    if (engagement.totalMs > 2 * 60 * 60 * 1000) return 'learner';
    return 'consumer';
  }
  
  if (node.type === 'content') {
    return 'consumer';
  }
  
  return 'unknown';
}

// --- Trend Calculation ---

export function calculateTrend(
  engagement: { totalMs: number; recentMs: number; lastSeen: number } | undefined
): EngagementTrend {
  if (!engagement) return 'new';
  
  const now = Date.now();
  const daysSinceLastSeen = (now - engagement.lastSeen) / (24 * 60 * 60 * 1000);
  
  // New if first seen in last 7 days and low total
  if (engagement.totalMs < 30 * 60 * 1000 && daysSinceLastSeen < 7) {
    return 'new';
  }
  
  // Calculate recent vs total ratio
  const recentRatio = engagement.recentMs / Math.max(engagement.totalMs, 1);
  
  if (recentRatio > 0.6) return 'increasing';
  if (recentRatio < 0.2) return 'decreasing';
  return 'stable';
}

// --- Salience Calculation ---

export function calculateSalience(
  node: EntityNode,
  engagement: { totalMs: number; sessions: number; recentMs: number; lastSeen: number } | undefined,
  maxEngagement: number
): number {
  if (!engagement || maxEngagement === 0) return 0;
  
  const now = Date.now();
  
  // Base score from relative engagement
  const engagementScore = engagement.totalMs / maxEngagement;
  
  // Recency boost (exponential decay over 14 days)
  const daysSince = (now - engagement.lastSeen) / (24 * 60 * 60 * 1000);
  const recencyMultiplier = Math.exp(-daysSince / 14);
  
  // Frequency boost (log of sessions)
  const frequencyBoost = Math.log2(engagement.sessions + 1) / 10;
  
  // Recent activity boost
  const recentBoost = engagement.recentMs > 0 ? 0.2 : 0;
  
  // Combine (weighted)
  const salience = (engagementScore * 0.4 + recencyMultiplier * 0.3 + frequencyBoost + recentBoost);
  
  return Math.min(1, Math.max(0, salience));
}

// --- Node Enrichment ---

export function enrichNodes(
  store: EntityStore,
  signals: ActivitySignals
): void {
  // Find max engagement for normalization
  let maxEngagement = 0;
  for (const eng of Object.values(signals.entityEngagement)) {
    if (eng.totalMs > maxEngagement) maxEngagement = eng.totalMs;
  }
  
  // Enrich each node
  for (const [id, node] of store.nodes) {
    const engagement = signals.entityEngagement[id];
    
    // Update engagement metrics
    if (engagement) {
      node.engagementMs = engagement.totalMs;
      node.sessionCount = engagement.sessions;
    }
    
    // Compute derived properties
    node.engagementTrend = calculateTrend(engagement);
    node.salience = calculateSalience(node, engagement, maxEngagement);
    node.role = inferRole(node, engagement, false); // TODO: track creation
    
    // Infer context from node's associated contexts
    if (node.contexts.length > 0) {
      const contextCounts: Record<ContextType, number> = {
        work: 0, learning: 0, entertainment: 0, social: 0, personal: 0, unknown: 0
      };
      for (const ctx of node.contexts) {
        const inferred = inferContext(ctx, null);
        contextCounts[inferred]++;
      }
      // Pick most common
      let maxCount = 0;
      let primaryContext: ContextType = 'unknown';
      for (const [ctx, count] of Object.entries(contextCounts)) {
        if (count > maxCount) {
          maxCount = count;
          primaryContext = ctx as ContextType;
        }
      }
      node.primaryContext = primaryContext;
    }
    
    // For skills: compute proficiency from engagement
    if (node.type === 'skill' && engagement) {
      const hours = engagement.totalMs / (60 * 60 * 1000);
      // Rough proficiency: log scale, maxes around 100 hours
      node.proficiency = Math.min(1, Math.log2(hours + 1) / Math.log2(100));
    }
  }
}

// --- Edge Enrichment ---

export function enrichEdges(
  store: EntityStore,
  signals: ActivitySignals
): void {
  for (const [, edge] of store.edges) {
    // Update lastActive from node engagement
    const sourceEng = signals.entityEngagement[edge.source];
    const targetEng = signals.entityEngagement[edge.target];
    
    if (sourceEng && targetEng) {
      edge.lastActive = Math.max(sourceEng.lastSeen, targetEng.lastSeen);
    }
    
    // Infer context from connected nodes
    const sourceNode = store.nodes.get(edge.source);
    const targetNode = store.nodes.get(edge.target);
    
    if (sourceNode?.primaryContext && targetNode?.primaryContext) {
      // If both same context, use it
      if (sourceNode.primaryContext === targetNode.primaryContext) {
        edge.context = sourceNode.primaryContext;
      } else if (sourceNode.primaryContext !== 'unknown') {
        edge.context = sourceNode.primaryContext;
      } else {
        edge.context = targetNode.primaryContext;
      }
    }
  }
}

// --- Graph Metadata Computation ---

export function computeMetadata(
  store: EntityStore,
  signals: ActivitySignals
): GraphMetadata {
  const metadata = createEmptyMetadata();
  
  // Peak hours (top 4)
  const hourlyWithIndex = signals.hourlyActivity.map((count, hour) => ({ hour, count }));
  hourlyWithIndex.sort((a, b) => b.count - a.count);
  metadata.peakHours = hourlyWithIndex.slice(0, 4).map(h => h.hour);
  
  // Peak days (top 3)
  const dailyWithIndex = signals.dailyActivity.map((count, day) => ({ day, count }));
  dailyWithIndex.sort((a, b) => b.count - a.count);
  metadata.peakDays = dailyWithIndex.slice(0, 3).map(d => d.day);
  
  // Current focus (top 5 salient nodes)
  const nodesBySalience = Array.from(store.nodes.values())
    .filter(n => n.salience && n.salience > 0.1)
    .sort((a, b) => (b.salience || 0) - (a.salience || 0));
  metadata.currentFocus = nodesBySalience.slice(0, 5).map(n => n.id);
  
  // Session stats
  if (signals.sessionDurations.length > 0) {
    const avgMs = signals.sessionDurations.reduce((a, b) => a + b, 0) / signals.sessionDurations.length;
    metadata.avgSessionMinutes = Math.round(avgMs / 60000);
  }
  
  // Context switch rate
  metadata.contextSwitchRate = signals.switchTimestamps.length;
  
  // Category distribution
  const categoryMs: Record<string, number> = {};
  let totalCategoryMs = 0;
  
  for (const node of store.nodes.values()) {
    if (node.primaryContext && node.engagementMs) {
      categoryMs[node.primaryContext] = (categoryMs[node.primaryContext] || 0) + node.engagementMs;
      totalCategoryMs += node.engagementMs;
    }
  }
  
  if (totalCategoryMs > 0) {
    for (const [category, ms] of Object.entries(categoryMs)) {
      metadata.categoryDistribution[category] = Math.round((ms / totalCategoryMs) * 100) / 100;
    }
  }
  
  metadata.totalEngagementMs = signals.totalActivityMs;
  metadata.lastUpdated = Date.now();
  
  return metadata;
}

// --- Full Enrichment Pass ---

export function enrichGraph(
  store: EntityStore,
  signals: ActivitySignals
): GraphMetadata {
  enrichNodes(store, signals);
  enrichEdges(store, signals);
  return computeMetadata(store, signals);
}

// --- Decay old engagement ---

export function decayEngagement(signals: ActivitySignals, cutoffDays: number = 30): void {
  const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
  
  // Decay recent engagement for old entries
  for (const eng of Object.values(signals.entityEngagement)) {
    if (eng.lastSeen < cutoff) {
      eng.recentMs = 0;
    }
  }
}
