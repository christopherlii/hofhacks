/**
 * Context Types - Core data structures for the refactored context system
 */

export interface ContextEntity {
  id: string;
  label: string;
  type: 'person' | 'topic' | 'project' | 'content' | 'place' | 'goal';
  role?: string; // e.g., "collaborator", "research_subject", "work_output"
  confidence: number; // 0-1
}

export interface ContextRelationship {
  fromId: string;
  toId: string;
  type: string; // working_on, researching, communicating_with, etc.
  confidence: number;
  evidence: string; // Brief explanation of why this relationship exists
}

export interface Task {
  id: string;
  sessionId: string;
  startTime: number;
  endTime: number;
  
  // Intent
  intent: string; // What the user was trying to accomplish
  intentConfidence: number;
  
  // Context
  primaryApp: string;
  apps: string[];
  urls: string[];
  
  // Extracted entities and relationships
  entities: ContextEntity[];
  relationships: ContextRelationship[];
  
  // Raw context that led to this extraction
  activitySummary: string;
  screenTextSample: string;
}

export interface Session {
  id: string;
  startTime: number;
  endTime: number | null; // null if ongoing
  
  // Session-level summary
  summary: string | null;
  primaryIntent: string | null;
  
  // Aggregated from tasks
  tasks: Task[];
  topEntities: Array<{ id: string; label: string; importance: number }>;
  
  // Metadata
  isActive: boolean;
  totalDurationMs: number;
}

export interface ActivityAccumulator {
  startTime: number;
  lastUpdateTime: number;
  
  // Raw data being accumulated
  apps: Map<string, number>; // app -> time spent
  windows: Array<{ app: string; title: string; url: string | null; timestamp: number }>;
  screenTexts: string[];
  clipboardEntries: string[];
  
  // Current focus
  currentApp: string | null;
  currentTitle: string | null;
  currentUrl: string | null;
}

export interface ImportanceFactors {
  dwellTimeMs: number;
  actionCount: number; // times mentioned/interacted
  recurrence: number; // appearances across sessions
  centrality: number; // connection count to other important entities
  lastSeenMs: number;
}

export interface ScoredEntity {
  id: string;
  label: string;
  type: string;
  importance: number; // Computed score
  factors: ImportanceFactors;
}

// Configuration
export interface ContextConfig {
  // Session detection
  sessionGapMinutes: number; // Gap to consider new session (default: 30)
  sessionMinDurationMinutes: number; // Min duration for valid session (default: 5)
  
  // Task extraction
  taskAccumulationMinutes: number; // How long to accumulate before extracting (default: 3)
  minScreenTextsForExtraction: number; // Min screen captures before extraction (default: 2)
  
  // Importance scoring
  dwellTimeWeight: number;
  recurrenceWeight: number;
  centralityWeight: number;
  recencyDecayDays: number;
  
  // Pruning
  minImportanceToKeep: number;
  maxEntitiesPerSession: number;
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  sessionGapMinutes: 30,
  sessionMinDurationMinutes: 5,
  taskAccumulationMinutes: 3,
  minScreenTextsForExtraction: 2,
  dwellTimeWeight: 0.3,
  recurrenceWeight: 0.25,
  centralityWeight: 0.25,
  recencyDecayDays: 14,
  minImportanceToKeep: 0.1,
  maxEntitiesPerSession: 50,
};
