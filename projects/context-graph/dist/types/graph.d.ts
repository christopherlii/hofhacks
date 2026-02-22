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
export type NodeType = 'identity' | 'trait' | 'skill' | 'interest' | 'belief' | 'goal' | 'project' | 'person' | 'organization' | 'behavior' | 'preference' | 'event' | 'location' | 'resource' | 'pattern' | 'emotion' | 'context';
export type EdgeType = 'is' | 'has' | 'wants' | 'does' | 'knows' | 'uses' | 'attends' | 'created' | 'believes' | 'prefers' | 'avoids' | 'triggers' | 'correlates' | 'contradicts' | 'depends_on' | 'leads_to' | 'part_of';
export interface Node {
    id: string;
    type: NodeType;
    label: string;
    attributes: Record<string, any>;
    confidence: number;
    sources: Source[];
    firstSeen: Date;
    lastUpdated: Date;
    salience: number;
}
export interface Edge {
    id: string;
    type: EdgeType;
    source: string;
    target: string;
    weight: number;
    confidence: number;
    evidence: string[];
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
    recency: number;
}
export interface ContextGraph {
    version: string;
    subject: string;
    generatedAt: Date;
    nodes: Map<string, Node>;
    edges: Map<string, Edge>;
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
    coherence: number;
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
    modifiedNodes: {
        before: Node;
        after: Node;
    }[];
    addedEdges: Edge[];
    removedEdges: Edge[];
    modifiedEdges: {
        before: Edge;
        after: Edge;
    }[];
}
