/**
 * Session Manager - Detects and manages user sessions
 * 
 * A session represents a coherent block of work (30+ minutes)
 * Sessions help group related context and provide temporal structure
 */

import type { Session, Task, ContextConfig, ActivityAccumulator } from './types';
import { DEFAULT_CONTEXT_CONFIG } from './types';

export class SessionManager {
  private config: ContextConfig;
  private sessions: Map<string, Session> = new Map();
  private currentSession: Session | null = null;
  private lastActivityTime: number = 0;
  
  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * Record activity and manage session boundaries
   */
  recordActivity(timestamp: number = Date.now()): Session {
    const gapMs = this.config.sessionGapMinutes * 60 * 1000;
    
    // Check if we need a new session
    if (!this.currentSession || (timestamp - this.lastActivityTime) > gapMs) {
      // Close previous session if exists
      if (this.currentSession) {
        this.closeSession(this.lastActivityTime);
      }
      
      // Start new session
      this.currentSession = this.createSession(timestamp);
      this.sessions.set(this.currentSession.id, this.currentSession);
      console.log(`[Context] New session started: ${this.currentSession.id}`);
    }
    
    this.lastActivityTime = timestamp;
    this.currentSession.totalDurationMs = timestamp - this.currentSession.startTime;
    
    return this.currentSession;
  }

  /**
   * Add a completed task to the current session
   */
  addTask(task: Task): void {
    if (!this.currentSession) {
      this.recordActivity(task.startTime);
    }
    
    if (this.currentSession) {
      this.currentSession.tasks.push(task);
      this.updateSessionTopEntities();
    }
  }

  /**
   * Get the current active session
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get recent sessions
   */
  getRecentSessions(limit: number = 10): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  /**
   * Close the current session
   */
  closeSession(endTime: number = Date.now()): void {
    if (!this.currentSession) return;
    
    this.currentSession.endTime = endTime;
    this.currentSession.isActive = false;
    this.currentSession.totalDurationMs = endTime - this.currentSession.startTime;
    
    // Only keep sessions that meet minimum duration
    const minDurationMs = this.config.sessionMinDurationMinutes * 60 * 1000;
    if (this.currentSession.totalDurationMs < minDurationMs) {
      this.sessions.delete(this.currentSession.id);
      console.log(`[Context] Session discarded (too short): ${this.currentSession.id}`);
    } else {
      console.log(`[Context] Session closed: ${this.currentSession.id} (${Math.round(this.currentSession.totalDurationMs / 60000)}min)`);
    }
    
    this.currentSession = null;
  }

  /**
   * Generate a summary for a session using AI
   */
  async generateSessionSummary(
    sessionId: string,
    summarize: (tasks: Task[]) => Promise<{ summary: string; primaryIntent: string } | null>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.tasks.length === 0) return;
    
    const result = await summarize(session.tasks);
    if (result) {
      session.summary = result.summary;
      session.primaryIntent = result.primaryIntent;
    }
  }

  /**
   * Serialize sessions for persistence
   */
  serialize(): { sessions: Session[]; currentSessionId: string | null } {
    return {
      sessions: Array.from(this.sessions.values()),
      currentSessionId: this.currentSession?.id || null,
    };
  }

  /**
   * Load sessions from persistence
   */
  load(data: { sessions: Session[]; currentSessionId: string | null }): void {
    this.sessions.clear();
    for (const session of data.sessions) {
      this.sessions.set(session.id, session);
    }
    
    if (data.currentSessionId) {
      this.currentSession = this.sessions.get(data.currentSessionId) || null;
      if (this.currentSession) {
        this.lastActivityTime = this.currentSession.startTime + (this.currentSession.totalDurationMs || 0);
      }
    }
  }

  // Private methods

  private createSession(startTime: number): Session {
    return {
      id: `session_${startTime}_${Math.random().toString(36).slice(2, 8)}`,
      startTime,
      endTime: null,
      summary: null,
      primaryIntent: null,
      tasks: [],
      topEntities: [],
      isActive: true,
      totalDurationMs: 0,
    };
  }

  private updateSessionTopEntities(): void {
    if (!this.currentSession) return;
    
    // Aggregate entities from all tasks
    const entityScores = new Map<string, { label: string; score: number }>();
    
    for (const task of this.currentSession.tasks) {
      for (const entity of task.entities) {
        const existing = entityScores.get(entity.id);
        const taskWeight = (task.endTime - task.startTime) / 60000; // Weight by task duration in minutes
        const score = entity.confidence * taskWeight;
        
        if (existing) {
          existing.score += score;
        } else {
          entityScores.set(entity.id, { label: entity.label, score });
        }
      }
    }
    
    // Sort and limit
    this.currentSession.topEntities = Array.from(entityScores.entries())
      .map(([id, { label, score }]) => ({ id, label, importance: score }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, this.config.maxEntitiesPerSession);
  }
}

export function createSessionManager(config?: Partial<ContextConfig>): SessionManager {
  return new SessionManager(config);
}
