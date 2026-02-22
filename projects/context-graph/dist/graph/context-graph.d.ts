/**
 * Core Context Graph implementation
 *
 * Manages the knowledge graph, handles merging, clustering,
 * and computes derived properties.
 */
import { ContextGraph, Cluster, Contradiction, Gap, ExtractionResult, GraphDiff } from '../types/graph.js';
export declare class ContextGraphBuilder {
    private nodes;
    private edges;
    private subject;
    constructor(subject: string);
    /**
     * Merge extraction results into the graph
     * Handles deduplication and confidence updates
     */
    merge(result: ExtractionResult): GraphDiff;
    /**
     * Find a node that likely represents the same entity
     */
    private findSimilarNode;
    private calculateSimilarity;
    private levenshteinDistance;
    /**
     * Merge two nodes representing the same entity
     */
    private mergeNodes;
    private weightedConfidence;
    /**
     * Merge two edges
     */
    private mergeEdges;
    /**
     * Resolve a node reference (could be ID or label)
     */
    private resolveNodeReference;
    /**
     * Build clusters using connected components + semantic similarity
     */
    buildClusters(): Cluster[];
    private inferClusterLabel;
    private calculateClusterCoherence;
    private extractThemes;
    /**
     * Find central nodes using PageRank-like scoring
     */
    findCentralNodes(topN?: number): string[];
    /**
     * Detect potential contradictions in the graph
     */
    findContradictions(): Contradiction[];
    /**
     * Identify gaps in knowledge
     */
    findGaps(): Gap[];
    /**
     * Export the complete graph
     */
    build(): ContextGraph;
    /**
     * Get current stats
     */
    getStats(): {
        nodeCount: number;
        edgeCount: number;
        nodesByType: Record<string, number>;
        edgesByType: Record<string, number>;
    };
    private countByType;
}
