/**
 * Core types for the Context Graph system
 * 
 * Philosophy: A person is a network of:
 * - Identity nodes (who they are)
 * - Behavior nodes (what they do)
 * - Relationship nodes (who they connect with)
 * - Interest nodes (what they care about)
 * - Belief nodes (what they think)
 * - Project nodes (what they build)
 * - Temporal nodes (when things happen)
 */

export type NodeType = 
  | 'identity'      // Name, pronouns, timezone, demographics
  | 'trait'         // Personality traits, characteristics
  | 'skill'         // Technical/soft skills
  | 'interest'      // Topics, hobbies, passions
  | 'belief'        // Values, principles, worldviews
  | 'goal'          // Objectives, aspirations
  | 'project'       // Things being built
  | 'person'        // People in their network
  | 'organization'  // Companies, schools, groups
  | 'behavior'      // Patterns of action
  | 'preference'    // Likes/dislikes, style preferences
  | 'event'         // Significant occurrences
  | 'location'      // Places relevant to them
  | 'resource'      // Tools, accounts, assets
  | 'pattern'       // Recurring behavioral patterns
  | 'emotion'       // Emotional states and triggers
  | 'context';      // Situational context

export type EdgeType =
  | 'is'            // Identity relationship (Chris IS ambitious)
  | 'has'           // Possession (Chris HAS skill in TypeScript)
  | 'wants'         // Desire (Chris WANTS to be a billionaire)
  | 'does'          // Action (Chris DOES build startups)
  | 'knows'         // Connection (Chris KNOWS [person])
  | 'uses'          // Tool usage (Chris USES Notion)
  | 'attends'       // Affiliation (Chris ATTENDS NYU)
  | 'created'       // Creation (Chris CREATED nyu-swipes)
  | 'believes'      // Belief (Chris BELIEVES in high agency)
  | 'prefers'       // Preference (Chris PREFERS direct communication)
  | 'avoids'        // Avoidance (Chris AVOIDS fluff)
  | 'triggers'      // Causation (X TRIGGERS Y)
  | 'correlates'    // Correlation (X often appears with Y)
  | 'contradicts'   // Tension (X contradicts Y)
  | 'depends_on'    // Dependency (X depends on Y)
  | 'leads_to'      // Progression (X leads to Y)
  | 'part_of';      // Composition (X is part of Y)

export interface Node {
  id: string;
  type: NodeType;
  label: string;
  attributes: Record<string, any>;
  confidence: number;      // 0-1, how confident are we in this node
  sources: Source[];       // Where did this come from
  firstSeen: Date;
  lastUpdated: Date;
  salience: number;        // 0-1, how important/central is this
}

export interface Edge {
  id: string;
  type: EdgeType;
  source: string;          // Node ID
  target: string;          // Node ID
  weight: number;          // 0-1, strength of relationship
  confidence: number;      // 0-1, how confident
  evidence: string[];      // Supporting evidence
  sources: Source[];
  temporal?: TemporalInfo;
}

export interface Source {
  type: 'conversation' | 'file' | 'browser' | 'action' | 'inference';
  id: string;
  timestamp: Date;
  snippet?: string;
}

export interface TemporalInfo {
  start?: Date;
  end?: Date;
  frequency?: 'once' | 'daily' | 'weekly' | 'monthly' | 'ongoing';
  recency: number;         // 0-1, how recent
}

export interface ContextGraph {
  version: string;
  subject: string;         // Who this graph is about
  generatedAt: Date;
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  
  // Computed properties
  clusters: Cluster[];
  centralNodes: string[];
  temporalPatterns: TemporalPattern[];
  contradictions: Contradiction[];
  gaps: Gap[];
}

export interface Cluster {
  id: string;
  label: string;
  nodeIds: string[];
  coherence: number;       // How well-connected internally
  themes: string[];
}

export interface TemporalPattern {
  description: string;
  frequency: string;
  nodes: string[];
  confidence: number;
}

export interface Contradiction {
  nodeA: string;
  nodeB: string;
  description: string;
  resolution?: string;
}

export interface Gap {
  area: string;
  description: string;
  suggestedQuestions: string[];
}

export interface ExtractionResult {
  nodes: Node[];
  edges: Edge[];
  rawInsights: string[];
  confidence: number;
}

export interface GraphDiff {
  addedNodes: Node[];
  removedNodes: Node[];
  modifiedNodes: { before: Node; after: Node }[];
  addedEdges: Edge[];
  removedEdges: Edge[];
  modifiedEdges: { before: Edge; after: Edge }[];
}
