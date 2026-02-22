/**
 * Task Extractor - Batched context extraction with intent understanding
 * 
 * Instead of extracting entities from every screenshot, we:
 * 1. Accumulate context for a few minutes
 * 2. Run a single AI call to extract:
 *    - Intent (what the user is trying to do)
 *    - Entities (with roles and confidence)
 *    - Relationships (with evidence)
 */

import type { 
  Task, 
  ContextEntity, 
  ContextRelationship, 
  ActivityAccumulator,
  ContextConfig 
} from './types';
import { DEFAULT_CONTEXT_CONFIG } from './types';
import { extractJsonObject } from '../../lib/utils';

interface TaskExtractorDeps {
  claudeRequest: (body: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
  }) => Promise<{ content?: Array<{ text?: string }> } | null>;
  
  getCurrentSession: () => { id: string } | null;
}

const TASK_EXTRACTION_PROMPT = `You analyze a user's computer activity to understand what they were doing.

Given activity data (apps used, window titles, URLs, screen text), extract:

1. INTENT: What was the user trying to accomplish? (1 sentence, specific)
2. ENTITIES: Who/what was involved? For each:
   - label: Name
   - type: person|topic|project|content|place|goal
   - role: How this entity relates to the task (e.g., "collaborator", "research_subject", "work_output", "tool")
   - confidence: 0.0-1.0
3. RELATIONSHIPS: How are entities connected? For each:
   - from/to: Entity labels
   - type: working_on|researching|communicating_with|using|creating|planning|related_to
   - evidence: Brief explanation (why you think they're connected)
   - confidence: 0.0-1.0

RULES:
- Focus on what's meaningful to the USER, not generic/system things
- Be specific: "editing React component for SwipeShare" not "coding"
- Only extract entities that are clearly relevant to the task
- Relationships need evidence from the activity data
- Max 8 entities, 5 relationships
- If unclear, lower confidence rather than guessing

Return JSON:
{
  "intent": "string",
  "intentConfidence": 0.0-1.0,
  "entities": [{ "label": "...", "type": "...", "role": "...", "confidence": 0.0-1.0 }],
  "relationships": [{ "from": "...", "to": "...", "type": "...", "evidence": "...", "confidence": 0.0-1.0 }]
}`;

export class TaskExtractor {
  private config: ContextConfig;
  private deps: TaskExtractorDeps;
  private accumulator: ActivityAccumulator | null = null;
  
  constructor(deps: TaskExtractorDeps, config: Partial<ContextConfig> = {}) {
    this.deps = deps;
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * Start accumulating context for a new task
   */
  startAccumulating(): void {
    const now = Date.now();
    this.accumulator = {
      startTime: now,
      lastUpdateTime: now,
      apps: new Map(),
      windows: [],
      screenTexts: [],
      clipboardEntries: [],
      currentApp: null,
      currentTitle: null,
      currentUrl: null,
    };
  }

  /**
   * Add activity to the accumulator
   */
  addActivity(data: {
    app: string;
    title: string;
    url: string | null;
    screenText?: string;
    clipboardText?: string;
  }): void {
    if (!this.accumulator) {
      this.startAccumulating();
    }
    
    const acc = this.accumulator!;
    const now = Date.now();
    
    // Track app time
    const prevTime = acc.apps.get(data.app) || 0;
    acc.apps.set(data.app, prevTime + (now - acc.lastUpdateTime));
    
    // Record window
    acc.windows.push({
      app: data.app,
      title: data.title,
      url: data.url,
      timestamp: now,
    });
    
    // Keep last 20 windows
    if (acc.windows.length > 20) {
      acc.windows = acc.windows.slice(-20);
    }
    
    // Add screen text (deduplicated)
    if (data.screenText && data.screenText.length > 50) {
      const trimmed = data.screenText.slice(0, 500);
      // Only add if significantly different from last
      const last = acc.screenTexts[acc.screenTexts.length - 1];
      if (!last || this.textSimilarity(trimmed, last) < 0.8) {
        acc.screenTexts.push(trimmed);
        // Keep last 10
        if (acc.screenTexts.length > 10) {
          acc.screenTexts = acc.screenTexts.slice(-10);
        }
      }
    }
    
    // Add clipboard
    if (data.clipboardText && data.clipboardText.length > 5) {
      if (!acc.clipboardEntries.includes(data.clipboardText)) {
        acc.clipboardEntries.push(data.clipboardText.slice(0, 200));
        if (acc.clipboardEntries.length > 5) {
          acc.clipboardEntries = acc.clipboardEntries.slice(-5);
        }
      }
    }
    
    acc.currentApp = data.app;
    acc.currentTitle = data.title;
    acc.currentUrl = data.url;
    acc.lastUpdateTime = now;
  }

  /**
   * Check if we should extract a task now
   */
  shouldExtract(): boolean {
    if (!this.accumulator) return false;
    
    const elapsedMs = Date.now() - this.accumulator.startTime;
    const elapsedMinutes = elapsedMs / 60000;
    
    // Extract if enough time has passed AND we have enough data
    return (
      elapsedMinutes >= this.config.taskAccumulationMinutes &&
      this.accumulator.screenTexts.length >= this.config.minScreenTextsForExtraction
    );
  }

  /**
   * Extract a task from accumulated context
   */
  async extractTask(): Promise<Task | null> {
    if (!this.accumulator || this.accumulator.screenTexts.length === 0) {
      return null;
    }
    
    const acc = this.accumulator;
    const session = this.deps.getCurrentSession();
    
    // Build context string for AI
    const contextString = this.buildContextString(acc);
    
    // Reset accumulator for next task
    const taskStartTime = acc.startTime;
    const taskEndTime = acc.lastUpdateTime;
    this.startAccumulating();
    
    // Call AI for extraction
    const result = await this.deps.claudeRequest({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: TASK_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: contextString }],
    });
    
    if (!result?.content?.[0]?.text) {
      console.log('[Context] Task extraction failed - no response');
      return null;
    }
    
    const parsed = extractJsonObject<{
      intent?: string;
      intentConfidence?: number;
      entities?: Array<{ label: string; type: string; role?: string; confidence: number }>;
      relationships?: Array<{ from: string; to: string; type: string; evidence: string; confidence: number }>;
    }>(result.content[0].text);
    
    if (!parsed || !parsed.intent) {
      console.log('[Context] Task extraction failed - invalid response');
      return null;
    }
    
    // Build task object
    const task: Task = {
      id: `task_${taskStartTime}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: session?.id || 'unknown',
      startTime: taskStartTime,
      endTime: taskEndTime,
      intent: parsed.intent,
      intentConfidence: parsed.intentConfidence || 0.5,
      primaryApp: this.getPrimaryApp(acc.apps),
      apps: Array.from(acc.apps.keys()),
      urls: acc.windows.filter(w => w.url).map(w => w.url!).filter((v, i, a) => a.indexOf(v) === i),
      entities: (parsed.entities || []).map(e => ({
        id: `${e.type}:${e.label.toLowerCase().replace(/[^\w\s]/g, '').trim()}`,
        label: e.label,
        type: e.type as ContextEntity['type'],
        role: e.role,
        confidence: e.confidence,
      })),
      relationships: (parsed.relationships || []).map(r => ({
        fromId: `${this.findEntityType(parsed.entities || [], r.from)}:${r.from.toLowerCase().replace(/[^\w\s]/g, '').trim()}`,
        toId: `${this.findEntityType(parsed.entities || [], r.to)}:${r.to.toLowerCase().replace(/[^\w\s]/g, '').trim()}`,
        type: r.type,
        confidence: r.confidence,
        evidence: r.evidence,
      })),
      activitySummary: contextString.slice(0, 500),
      screenTextSample: acc.screenTexts.slice(0, 3).join('\n---\n').slice(0, 300),
    };
    
    console.log(`[Context] Task extracted: "${task.intent}" (${task.entities.length} entities, ${task.relationships.length} relationships)`);
    return task;
  }

  /**
   * Get the current accumulator state (for debugging)
   */
  getAccumulatorState(): ActivityAccumulator | null {
    return this.accumulator;
  }

  // Private helpers

  private buildContextString(acc: ActivityAccumulator): string {
    const parts: string[] = [];
    
    // Apps and time spent
    const appTimes = Array.from(acc.apps.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([app, ms]) => `${app}: ${Math.round(ms / 1000)}s`)
      .slice(0, 5);
    parts.push(`APPS USED: ${appTimes.join(', ')}`);
    
    // Recent windows
    const recentWindows = acc.windows.slice(-8).map(w => 
      `[${w.app}] ${w.title}${w.url ? ` (${w.url.slice(0, 60)})` : ''}`
    );
    parts.push(`WINDOWS:\n${recentWindows.join('\n')}`);
    
    // Screen text samples
    if (acc.screenTexts.length > 0) {
      const samples = acc.screenTexts.slice(-5).map(t => t.slice(0, 200)).join('\n---\n');
      parts.push(`SCREEN CONTENT:\n${samples}`);
    }
    
    // Clipboard
    if (acc.clipboardEntries.length > 0) {
      parts.push(`CLIPBOARD:\n${acc.clipboardEntries.join('\n')}`);
    }
    
    return parts.join('\n\n');
  }

  private getPrimaryApp(apps: Map<string, number>): string {
    let primary = 'Unknown';
    let maxTime = 0;
    for (const [app, time] of apps) {
      if (time > maxTime) {
        maxTime = time;
        primary = app;
      }
    }
    return primary;
  }

  private findEntityType(entities: Array<{ label: string; type: string }>, label: string): string {
    const entity = entities.find(e => e.label.toLowerCase() === label.toLowerCase());
    return entity?.type || 'topic';
  }

  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

export function createTaskExtractor(
  deps: TaskExtractorDeps,
  config?: Partial<ContextConfig>
): TaskExtractor {
  return new TaskExtractor(deps, config);
}
