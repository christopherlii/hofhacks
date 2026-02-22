/**
 * Importance Scorer - Calculates importance scores for entities
 * 
 * Importance is based on:
 * - Dwell time: How long user engaged with the entity
 * - Action count: How often it appears
 * - Recurrence: Appearances across sessions
 * - Centrality: Connections to other important entities
 * - Recency: Exponential decay over time
 */

import type { 
  ScoredEntity, 
  ImportanceFactors, 
  ContextConfig,
  Task,
  Session
} from './types';
import { DEFAULT_CONTEXT_CONFIG } from './types';

export class ImportanceScorer {
  private config: ContextConfig;
  private entityFactors: Map<string, ImportanceFactors> = new Map();
  private entityLabels: Map<string, string> = new Map();
  private entityTypes: Map<string, string> = new Map();
  
  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * Update factors from a completed task
   */
  processTask(task: Task): void {
    const taskDurationMs = task.endTime - task.startTime;
    const entityCount = task.entities.length || 1;
    const dwellPerEntity = taskDurationMs / entityCount;
    
    for (const entity of task.entities) {
      const existing = this.entityFactors.get(entity.id) || this.createEmptyFactors();
      
      existing.dwellTimeMs += dwellPerEntity * entity.confidence;
      existing.actionCount += 1;
      existing.lastSeenMs = Math.max(existing.lastSeenMs, task.endTime);
      
      this.entityFactors.set(entity.id, existing);
      this.entityLabels.set(entity.id, entity.label);
      this.entityTypes.set(entity.id, entity.type);
    }
    
    // Update centrality based on relationships
    for (const rel of task.relationships) {
      const fromFactors = this.entityFactors.get(rel.fromId);
      const toFactors = this.entityFactors.get(rel.toId);
      
      if (fromFactors) {
        fromFactors.centrality += rel.confidence;
      }
      if (toFactors) {
        toFactors.centrality += rel.confidence;
      }
    }
  }

  /**
   * Update recurrence based on session data
   */
  processSession(session: Session): void {
    const sessionEntities = new Set<string>();
    
    for (const task of session.tasks) {
      for (const entity of task.entities) {
        sessionEntities.add(entity.id);
      }
    }
    
    // Increment recurrence for entities in this session
    for (const entityId of sessionEntities) {
      const factors = this.entityFactors.get(entityId);
      if (factors) {
        factors.recurrence += 1;
      }
    }
  }

  /**
   * Calculate importance score for an entity
   */
  calculateScore(entityId: string): number {
    const factors = this.entityFactors.get(entityId);
    if (!factors) return 0;
    
    const now = Date.now();
    const daysSinceLastSeen = (now - factors.lastSeenMs) / (24 * 60 * 60 * 1000);
    
    // Normalize factors
    const dwellScore = Math.log2(factors.dwellTimeMs / 60000 + 1); // Log of minutes
    const actionScore = Math.log2(factors.actionCount + 1);
    const recurrenceScore = Math.log2(factors.recurrence + 1);
    const centralityScore = Math.log2(factors.centrality + 1);
    
    // Recency decay (exponential)
    const recencyMultiplier = Math.exp(-daysSinceLastSeen / this.config.recencyDecayDays);
    
    // Weighted combination
    const rawScore = (
      this.config.dwellTimeWeight * dwellScore +
      (1 - this.config.dwellTimeWeight - this.config.recurrenceWeight - this.config.centralityWeight) * actionScore +
      this.config.recurrenceWeight * recurrenceScore +
      this.config.centralityWeight * centralityScore
    );
    
    return rawScore * recencyMultiplier;
  }

  /**
   * Get all scored entities, sorted by importance
   */
  getAllScored(): ScoredEntity[] {
    const scored: ScoredEntity[] = [];
    
    for (const [id, factors] of this.entityFactors) {
      const importance = this.calculateScore(id);
      
      if (importance >= this.config.minImportanceToKeep) {
        scored.push({
          id,
          label: this.entityLabels.get(id) || id,
          type: this.entityTypes.get(id) || 'topic',
          importance,
          factors: { ...factors },
        });
      }
    }
    
    return scored.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Get top N entities by importance
   */
  getTopEntities(n: number): ScoredEntity[] {
    return this.getAllScored().slice(0, n);
  }

  /**
   * Prune low-importance entities
   */
  prune(): number {
    let pruned = 0;
    
    for (const [id] of this.entityFactors) {
      const score = this.calculateScore(id);
      if (score < this.config.minImportanceToKeep) {
        this.entityFactors.delete(id);
        this.entityLabels.delete(id);
        this.entityTypes.delete(id);
        pruned++;
      }
    }
    
    return pruned;
  }

  /**
   * Serialize for persistence
   */
  serialize(): { 
    factors: Array<[string, ImportanceFactors]>;
    labels: Array<[string, string]>;
    types: Array<[string, string]>;
  } {
    return {
      factors: Array.from(this.entityFactors.entries()),
      labels: Array.from(this.entityLabels.entries()),
      types: Array.from(this.entityTypes.entries()),
    };
  }

  /**
   * Load from persistence
   */
  load(data: {
    factors: Array<[string, ImportanceFactors]>;
    labels: Array<[string, string]>;
    types: Array<[string, string]>;
  }): void {
    this.entityFactors = new Map(data.factors);
    this.entityLabels = new Map(data.labels);
    this.entityTypes = new Map(data.types);
  }

  // Private helpers

  private createEmptyFactors(): ImportanceFactors {
    return {
      dwellTimeMs: 0,
      actionCount: 0,
      recurrence: 0,
      centrality: 0,
      lastSeenMs: 0,
    };
  }
}

export function createImportanceScorer(config?: Partial<ContextConfig>): ImportanceScorer {
  return new ImportanceScorer(config);
}
