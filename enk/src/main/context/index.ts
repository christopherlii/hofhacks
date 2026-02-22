/**
 * Context System - Unified API for the refactored context architecture
 * 
 * Usage:
 *   const context = createContextSystem({ claudeRequest, getStore });
 *   
 *   // On each activity update:
 *   context.recordActivity({ app, title, url, screenText });
 *   
 *   // Periodically (or when shouldExtract() returns true):
 *   if (context.shouldExtractTask()) {
 *     const task = await context.extractTask();
 *     if (task) context.commitTask(task);
 *   }
 *   
 *   // Get scored entities for graph:
 *   const entities = context.getTopEntities(50);
 */

import { SessionManager, createSessionManager } from './session-manager';
import { TaskExtractor, createTaskExtractor } from './task-extractor';
import { ImportanceScorer, createImportanceScorer } from './importance-scorer';
import type { 
  Task, 
  Session, 
  ScoredEntity, 
  ContextConfig,
  ContextEntity,
  ContextRelationship 
} from './types';
import { DEFAULT_CONTEXT_CONFIG } from './types';

export interface ContextSystemDeps {
  claudeRequest: (body: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
  }) => Promise<{ content?: Array<{ text?: string }> } | null>;
  
  getStore: () => any;
  
  // Callbacks for integration with existing graph system
  onEntityExtracted?: (entity: ContextEntity, task: Task) => void;
  onRelationshipExtracted?: (rel: ContextRelationship, task: Task) => void;
  onTaskCompleted?: (task: Task) => void;
  onSessionClosed?: (session: Session) => void;
}

export class ContextSystem {
  private config: ContextConfig;
  private deps: ContextSystemDeps;
  
  private sessionManager: SessionManager;
  private taskExtractor: TaskExtractor;
  private importanceScorer: ImportanceScorer;
  
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  
  constructor(deps: ContextSystemDeps, config: Partial<ContextConfig> = {}) {
    this.deps = deps;
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
    
    this.sessionManager = createSessionManager(this.config);
    this.taskExtractor = createTaskExtractor({
      claudeRequest: deps.claudeRequest,
      getCurrentSession: () => this.sessionManager.getCurrentSession(),
    }, this.config);
    this.importanceScorer = createImportanceScorer(this.config);
    
    // Load persisted state
    this.loadState();
  }

  /**
   * Record user activity - call this on each screen capture / activity update
   */
  recordActivity(data: {
    app: string;
    title: string;
    url: string | null;
    screenText?: string;
    clipboardText?: string;
  }): void {
    // Ensure session is active
    this.sessionManager.recordActivity();
    
    // Accumulate for task extraction
    this.taskExtractor.addActivity(data);
    
    // Schedule save
    this.scheduleSave();
  }

  /**
   * Check if we should extract a task now
   */
  shouldExtractTask(): boolean {
    return this.taskExtractor.shouldExtract();
  }

  /**
   * Extract a task from accumulated context
   */
  async extractTask(): Promise<Task | null> {
    return this.taskExtractor.extractTask();
  }

  /**
   * Commit an extracted task - updates session, scores, and triggers callbacks
   */
  commitTask(task: Task): void {
    // Add to session
    this.sessionManager.addTask(task);
    
    // Update importance scores
    this.importanceScorer.processTask(task);
    
    // Trigger callbacks for integration
    if (this.deps.onTaskCompleted) {
      this.deps.onTaskCompleted(task);
    }
    
    for (const entity of task.entities) {
      if (this.deps.onEntityExtracted) {
        this.deps.onEntityExtracted(entity, task);
      }
    }
    
    for (const rel of task.relationships) {
      if (this.deps.onRelationshipExtracted) {
        this.deps.onRelationshipExtracted(rel, task);
      }
    }
    
    this.scheduleSave();
  }

  /**
   * Close the current session (e.g., on app quit or long idle)
   */
  closeSession(): void {
    const session = this.sessionManager.getCurrentSession();
    if (session) {
      this.sessionManager.closeSession();
      this.importanceScorer.processSession(session);
      
      if (this.deps.onSessionClosed) {
        this.deps.onSessionClosed(session);
      }
    }
    
    this.saveState();
  }

  /**
   * Get top entities by importance score
   */
  getTopEntities(n: number = 50): ScoredEntity[] {
    return this.importanceScorer.getTopEntities(n);
  }

  /**
   * Get all scored entities
   */
  getAllEntities(): ScoredEntity[] {
    return this.importanceScorer.getAllScored();
  }

  /**
   * Get current session info
   */
  getCurrentSession(): Session | null {
    return this.sessionManager.getCurrentSession();
  }

  /**
   * Get recent sessions
   */
  getRecentSessions(limit: number = 10): Session[] {
    return this.sessionManager.getRecentSessions(limit);
  }

  /**
   * Prune low-importance entities
   */
  pruneEntities(): number {
    const pruned = this.importanceScorer.prune();
    if (pruned > 0) {
      this.saveState();
      console.log(`[Context] Pruned ${pruned} low-importance entities`);
    }
    return pruned;
  }

  /**
   * Get stats for debugging
   */
  getStats(): {
    currentSession: { id: string; duration: number; taskCount: number } | null;
    totalSessions: number;
    totalEntities: number;
    accumulatorState: { elapsed: number; screenTexts: number } | null;
  } {
    const session = this.sessionManager.getCurrentSession();
    const accState = this.taskExtractor.getAccumulatorState();
    
    return {
      currentSession: session ? {
        id: session.id,
        duration: session.totalDurationMs,
        taskCount: session.tasks.length,
      } : null,
      totalSessions: this.sessionManager.getRecentSessions(100).length,
      totalEntities: this.importanceScorer.getAllScored().length,
      accumulatorState: accState ? {
        elapsed: Date.now() - accState.startTime,
        screenTexts: accState.screenTexts.length,
      } : null,
    };
  }

  // Persistence

  private scheduleSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => this.saveState(), 5000);
  }

  private saveState(): void {
    const store = this.deps.getStore?.();
    if (!store) return;
    
    try {
      store.set('contextSessions', this.sessionManager.serialize());
      store.set('contextScores', this.importanceScorer.serialize());
      console.log('[Context] State saved');
    } catch (e) {
      console.error('[Context] Failed to save state:', e);
    }
  }

  private loadState(): void {
    const store = this.deps.getStore?.();
    if (!store) return;
    
    try {
      const sessions = store.get('contextSessions');
      const scores = store.get('contextScores');
      
      if (sessions) {
        this.sessionManager.load(sessions);
        console.log('[Context] Sessions loaded');
      }
      
      if (scores) {
        this.importanceScorer.load(scores);
        console.log('[Context] Scores loaded');
      }
    } catch (e) {
      console.error('[Context] Failed to load state:', e);
    }
  }
}

export function createContextSystem(
  deps: ContextSystemDeps,
  config?: Partial<ContextConfig>
): ContextSystem {
  return new ContextSystem(deps, config);
}

// Re-export types
export type { 
  Task, 
  Session, 
  ScoredEntity, 
  ContextConfig, 
  ContextEntity, 
  ContextRelationship,
  ImportanceFactors 
} from './types';
export { DEFAULT_CONTEXT_CONFIG } from './types';
