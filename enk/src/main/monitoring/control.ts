import { extractFastIntent } from './intent-extractor';

import type { ClaudeRequestBody, ClaudeResponse } from '../../types';

interface CreateMonitoringControlDeps {
  getStore: () => any;
  pollActiveWindow: () => Promise<void>;
  captureLoop: () => Promise<void>;
  flushToNia: () => Promise<void>;
  detectPatterns: () => Promise<void>;
  generateSummaries: () => Promise<void>;
  getAllActivity: () => any[];
  getAllSnapshots: () => any[];
  getLocalKnowledge: () => string;
  getRecentClipboard: () => { text: string }[];
  getRecentNowPlaying: () => { track: string; artist: string }[];
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  appendKnowledge: (facts: string[]) => void;
  localSignalsStart: () => void;
  localSignalsStop: () => void;
  saveGraphToStore: () => void;
  aiExtractEntities: () => Promise<void>;
  decayGraph: () => void;
  cleanupGraph: () => Promise<{ nodesRemoved: number; edgesRemoved: number }>;
  buildNiaEdges: () => Promise<void>;
  updateStatus: (status: string) => void;
  // Enrichment
  enrichGraph: () => any;
  decaySignals: () => void;
  saveFullGraph: () => void;
}

function createMonitoringControl(deps: CreateMonitoringControlDeps) {
  const GRAPH_SAVE_INTERVAL_MS = 10 * 60 * 1000;

  let windowPollTimer: ReturnType<typeof setInterval> | null = null;
  let captureTimer: ReturnType<typeof setInterval> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let patternTimer: ReturnType<typeof setInterval> | null = null;
  let summaryTimer: ReturnType<typeof setInterval> | null = null;
  let fastIntentTimer: ReturnType<typeof setInterval> | null = null;
  let graphSaveTimer: ReturnType<typeof setInterval> | null = null;
  let aiExtractTimer: ReturnType<typeof setInterval> | null = null;
  let graphCleanupTimer: ReturnType<typeof setInterval> | null = null;

  let fastIntentWarmupTimeout: ReturnType<typeof setTimeout> | null = null;
  let aiExtractWarmupTimeout: ReturnType<typeof setTimeout> | null = null;
  let graphWarmupTimeout: ReturnType<typeof setTimeout> | null = null;
  let enrichmentTimer: ReturnType<typeof setInterval> | null = null;

  async function fastIntentExtraction(): Promise<void> {
    await extractFastIntent({
      hasApiKey: Boolean(deps.getStore()?.get('anthropicKey')),
      recentEntries: deps.getAllActivity().slice(-10),
      recentSnapshots: deps.getAllSnapshots().slice(-5),
      recentClipboard: deps.getRecentClipboard().slice(-5),
      recentNowPlaying: deps.getRecentNowPlaying().slice(-3),
      localKnowledge: deps.getLocalKnowledge(),
      claudeRequest: deps.claudeRequest,
      appendKnowledge: deps.appendKnowledge,
    });
  }

  function startMonitoring(): void {
    if (windowPollTimer) return;

    console.log('[Enk] Starting monitoring (Tier 1: 500ms, Tier 2: 5s, Tier 3: 1h, Intents: 5min)');

    deps.pollActiveWindow();
    windowPollTimer = setInterval(deps.pollActiveWindow, 500);

    deps.updateStatus('active');
    deps.captureLoop();
    captureTimer = setInterval(deps.captureLoop, 5000);

    flushTimer = setInterval(deps.flushToNia, 60 * 60 * 1000);
    patternTimer = setInterval(deps.detectPatterns, 12 * 60 * 60 * 1000);
    summaryTimer = setInterval(deps.generateSummaries, 15000);
    deps.localSignalsStart();

    fastIntentTimer = setInterval(fastIntentExtraction, 5 * 60 * 1000);
    fastIntentWarmupTimeout = setTimeout(fastIntentExtraction, 2 * 60 * 1000);

    graphSaveTimer = setInterval(deps.saveGraphToStore, GRAPH_SAVE_INTERVAL_MS);

    aiExtractTimer = setInterval(deps.aiExtractEntities, 2 * 60 * 1000);
    aiExtractWarmupTimeout = setTimeout(deps.aiExtractEntities, 90 * 1000);

    graphWarmupTimeout = setTimeout(() => {
      deps.decayGraph();
      deps.cleanupGraph().catch(() => {});
      deps.buildNiaEdges().catch(() => {});
    }, 30000);

    graphCleanupTimer = setInterval(() => {
      deps.cleanupGraph().catch(() => {});
      deps.buildNiaEdges().catch(() => {});
    }, 30 * 60 * 1000);

    // Graph enrichment - every 10 minutes
    enrichmentTimer = setInterval(() => {
      deps.enrichGraph();
      deps.decaySignals();
    }, 10 * 60 * 1000);

    // Initial enrichment after 5 minutes of data collection
    setTimeout(() => {
      deps.enrichGraph();
    }, 5 * 60 * 1000);
  }

  function stopMonitoring(): void {
    if (windowPollTimer) {
      clearInterval(windowPollTimer);
      windowPollTimer = null;
    }
    if (captureTimer) {
      clearInterval(captureTimer);
      captureTimer = null;
    }
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    if (patternTimer) {
      clearInterval(patternTimer);
      patternTimer = null;
    }
    if (summaryTimer) {
      clearInterval(summaryTimer);
      summaryTimer = null;
    }
    if (fastIntentTimer) {
      clearInterval(fastIntentTimer);
      fastIntentTimer = null;
    }
    if (fastIntentWarmupTimeout) {
      clearTimeout(fastIntentWarmupTimeout);
      fastIntentWarmupTimeout = null;
    }
    if (graphSaveTimer) {
      clearInterval(graphSaveTimer);
      graphSaveTimer = null;
    }
    if (aiExtractTimer) {
      clearInterval(aiExtractTimer);
      aiExtractTimer = null;
    }
    if (aiExtractWarmupTimeout) {
      clearTimeout(aiExtractWarmupTimeout);
      aiExtractWarmupTimeout = null;
    }
    if (graphWarmupTimeout) {
      clearTimeout(graphWarmupTimeout);
      graphWarmupTimeout = null;
    }
    if (graphCleanupTimer) {
      clearInterval(graphCleanupTimer);
      graphCleanupTimer = null;
    }
    if (enrichmentTimer) {
      clearInterval(enrichmentTimer);
      enrichmentTimer = null;
    }

    deps.localSignalsStop();
    deps.saveFullGraph();
    deps.updateStatus('inactive');
    console.log('[Enk] Monitoring stopped');
  }

  return { startMonitoring, stopMonitoring };
}

export { createMonitoringControl };
