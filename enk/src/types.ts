import type { NativeImage } from 'electron';

// --- Window & Activity ---

export interface WindowInfo {
  app: string;
  title: string;
  url: string | null;
}

export interface BrowserInfo {
  url: string | null;
  tabTitle: string | null;
}

export interface ActivityEntry {
  app: string;
  title: string;
  url: string | null;
  start: number;
  end: number;
  duration: number;
  summary: string | null;
}

export interface ContentSnapshot {
  timestamp: number;
  app: string;
  title: string;
  url: string | null;
  text: string;
  fullText: string;
  summary: string | null;
}

// --- Screen & OCR ---

export interface ScreenCapture {
  id: string;
  name: string;
  nativeImage: NativeImage;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

// --- Context ---

export interface NowContext {
  activeApp: string | null;
  windowTitle: string | null;
  url: string | null;
  visibleText: string | null;
  ocrConfidence: number;
  timestamp: number;
}

// --- Claude API ---

export interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: string; content: unknown }[];
}

export interface ClaudeResponse {
  content?: { text: string }[];
  error?: unknown;
}

// --- Safety & Scam Detection ---

export interface ScamResult {
  flagged: boolean;
  risk_level: string;
  reason: string;
}

// --- Nia ---

export interface NiaNode {
  session_id: string;
  timestamp: number;
  app: string | null;
  window_title: string | null;
  url: string | null;
  task_label: string;
  entities: string[];
  visible_text: string | null;
  raw_context: unknown;
}

export interface NiaQueryResult {
  session_id: string;
  task_label: string;
  app: string | null;
  url: string | null;
  timestamp: number;
  relevance_score: number;
  snippet: string;
}

// --- Settings ---

export interface Settings {
  anthropicKey: string;
  niaKey: string;
  geminiKey?: string;              // Gemini API key for vision extraction
  enabled: boolean;
  scamDetection: boolean;
  useVisionExtraction?: boolean;   // Use Gemini 2.0 Flash for screen context
  firstLaunch: boolean;
  apiKey?: string;
  guardianEnabled?: boolean;
  elephantEnabled?: boolean;
}

// --- Entity Graph ---

export type EntityNodeType = 
  | 'person' 
  | 'topic' 
  | 'app' 
  | 'content' 
  | 'place' 
  | 'project' 
  | 'goal'
  | 'skill'      // Technologies, languages, tools the user works with
  | 'organization';

export type UserRole = 'creator' | 'collaborator' | 'consumer' | 'learner' | 'viewer' | 'unknown';
export type EngagementTrend = 'increasing' | 'stable' | 'decreasing' | 'new';
export type ContextType = 'work' | 'learning' | 'entertainment' | 'social' | 'personal' | 'unknown';

export interface EntityNode {
  id: string;
  label: string;
  type: EntityNodeType;
  
  // Basic tracking
  weight: number;
  firstSeen: number;
  lastSeen: number;
  contexts: string[];
  verified: boolean;
  
  // Engagement metrics (how user interacts with this entity)
  engagementMs?: number;           // Total time engaged
  sessionCount?: number;           // Number of sessions involving this
  
  // User's relationship to this entity
  role?: UserRole;                 // creator, consumer, learner, etc.
  engagementTrend?: EngagementTrend;
  
  // Context classification
  primaryContext?: ContextType;    // work, learning, entertainment, etc.
  
  // For skills/tools: proficiency indicator
  proficiency?: number;            // 0-1, inferred from usage patterns
  
  // Computed importance (updated periodically)
  salience?: number;               // 0-1, how central to user's life right now
}

export interface EntityEdge {
  source: string;
  target: string;
  weight: number;
  relation?: string;               // working_on, learning, uses, knows, collaborates_with, etc.
  lastActive?: number;             // Last time this relationship was active
  context?: ContextType;           // Context of this relationship
}

// --- Graph-Level Metadata (describes the user through the graph) ---

export interface GraphMetadata {
  // Temporal patterns (derived from activity)
  peakHours: number[];             // Hours when user is most active (0-23)
  peakDays: number[];              // Days when user is most active (0=Sun, 6=Sat)
  
  // Focus areas (top salient nodes)
  currentFocus: string[];          // Node IDs of highest salience
  
  // Work style metrics
  avgSessionMinutes: number;
  contextSwitchRate: number;       // Switches per hour
  
  // Category breakdown (% of time)
  categoryDistribution: Record<string, number>;
  
  // Graph stats
  lastUpdated: number;
  totalEngagementMs: number;
}

// --- Activity Signals (raw tracking, used to compute node properties) ---

export interface ActivitySignals {
  // Per-entity engagement
  entityEngagement: Record<string, {
    totalMs: number;
    sessions: number;
    lastSeen: number;
    recentMs: number;              // Last 7 days
  }>;
  
  // Temporal tracking
  hourlyActivity: number[];        // 24 slots
  dailyActivity: number[];         // 7 slots
  
  // Session tracking
  sessionDurations: number[];      // Recent session lengths
  switchTimestamps: number[];      // Recent context switches
  
  // Totals
  totalActivityMs: number;
  lastUpdated: number;
}

// --- User Model (semantic layer for apps) ---

export type RelationshipType = 
  | 'collaborator'    // Works together on projects
  | 'manager'         // Reports to / manages
  | 'friend'          // Personal relationship
  | 'contact'         // Professional acquaintance
  | 'mentor'          // Learning from
  | 'unknown';

export interface PersonEntity {
  id: string;
  name: string;
  relationship: RelationshipType;
  context: ContextType;            // work, social, etc.
  lastInteraction: number;
  interactionCount: number;
  communicationChannels: string[]; // slack, email, messages, etc.
  sharedProjects: string[];        // Project IDs they're connected to
  salience: number;
}

export interface ProjectEntity {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'unknown';
  context: ContextType;
  lastActivity: number;
  totalEngagementMs: number;
  recentEngagementMs: number;      // Last 7 days
  relatedPeople: string[];         // Person IDs
  relatedTools: string[];          // App/skill IDs
  salience: number;
}

export interface SkillEntity {
  id: string;
  name: string;
  proficiency: number;             // 0-1
  totalEngagementMs: number;
  lastUsed: number;
  trend: EngagementTrend;
  relatedProjects: string[];
}

export interface CurrentContext {
  // What's happening now
  app: string;
  task: string;                    // Inferred task description
  intent: 'creating' | 'researching' | 'communicating' | 'consuming' | 'navigating' | 'unknown';
  focusDepth: number;              // 0-1, how deep in flow state
  
  // Related entities
  activeProject: ProjectEntity | null;
  activePeople: PersonEntity[];
  
  // Time in current context
  contextStarted: number;
  contextDurationMs: number;
  
  // Confidence
  confidence: 'low' | 'medium' | 'high';
}

export interface WorkPatterns {
  peakHours: number[];             // Most productive hours
  peakDays: number[];              // Most productive days
  avgSessionMinutes: number;
  avgFocusBlockMinutes: number;    // Average uninterrupted work time
  contextSwitchRate: number;       // Switches per hour
  primaryWorkContext: ContextType;
  workLifeBalance: Record<ContextType, number>; // % distribution
}

export interface UserModel {
  // Who they work with
  topPeople: PersonEntity[];
  
  // What they're working on
  activeProjects: ProjectEntity[];
  
  // What they know
  expertise: SkillEntity[];
  
  // How they work
  workPatterns: WorkPatterns;
  
  // What's happening now
  currentFocus: {
    task: string;
    entities: string[];            // Node IDs
    confidence: 'low' | 'medium' | 'high';
  };
  
  // Meta
  lastUpdated: number;
  dataQuality: 'sparse' | 'moderate' | 'rich'; // Based on total engagement
}

// --- Task/Session Grouping ---

export interface TaskBlock {
  id: string;
  label: string;                   // "Working on Enk context engine"
  intent: string;                  // "coding", "researching", "communicating"
  startTime: number;
  endTime: number;
  durationMs: number;
  
  // Activity within the task
  apps: string[];
  entities: string[];              // Node IDs involved
  
  // Relationships
  project: string | null;          // Inferred project ID
  people: string[];                // Person IDs involved
  
  // Quality
  focusScore: number;              // 0-1, how focused was this block
  confidence: 'low' | 'medium' | 'high';
}
