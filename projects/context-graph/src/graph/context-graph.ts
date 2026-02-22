/**
 * Core Context Graph implementation
 * 
 * Manages the knowledge graph, handles merging, clustering,
 * and computes derived properties.
 */

import { 
  ContextGraph, Node, Edge, Cluster, TemporalPattern, 
  Contradiction, Gap, ExtractionResult, GraphDiff 
} from '../types/graph.js';
import { generateId, generateEdgeId } from '../utils/ids.js';

export class ContextGraphBuilder {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();
  private subject: string;

  constructor(subject: string) {
    this.subject = subject;
  }

  /**
   * Merge extraction results into the graph
   * Handles deduplication and confidence updates
   */
  merge(result: ExtractionResult): GraphDiff {
    const diff: GraphDiff = {
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [],
      addedEdges: [],
      removedEdges: [],
      modifiedEdges: []
    };

    // Process nodes
    for (const newNode of result.nodes) {
      const existing = this.findSimilarNode(newNode);
      
      if (existing) {
        // Update existing node
        const updated = this.mergeNodes(existing, newNode);
        diff.modifiedNodes.push({ before: existing, after: updated });
        this.nodes.set(existing.id, updated);
      } else {
        // Add new node
        diff.addedNodes.push(newNode);
        this.nodes.set(newNode.id, newNode);
      }
    }

    // Process edges
    for (const newEdge of result.edges) {
      // Resolve node references
      const sourceNode = this.resolveNodeReference(newEdge.source);
      const targetNode = this.resolveNodeReference(newEdge.target);
      
      if (!sourceNode || !targetNode) {
        console.warn(`Could not resolve edge: ${newEdge.source} -> ${newEdge.target}`);
        continue;
      }

      const normalizedEdge: Edge = {
        ...newEdge,
        id: generateEdgeId(sourceNode.id, newEdge.type, targetNode.id),
        source: sourceNode.id,
        target: targetNode.id
      };

      const existing = this.edges.get(normalizedEdge.id);
      
      if (existing) {
        const updated = this.mergeEdges(existing, normalizedEdge);
        diff.modifiedEdges.push({ before: existing, after: updated });
        this.edges.set(normalizedEdge.id, updated);
      } else {
        diff.addedEdges.push(normalizedEdge);
        this.edges.set(normalizedEdge.id, normalizedEdge);
      }
    }

    return diff;
  }

  /**
   * Find a node that likely represents the same entity
   */
  private findSimilarNode(node: Node): Node | undefined {
    // Exact ID match
    if (this.nodes.has(node.id)) {
      return this.nodes.get(node.id);
    }

    // Fuzzy match by type and label similarity
    const normalizedLabel = node.label.toLowerCase().trim();
    
    for (const existing of this.nodes.values()) {
      if (existing.type !== node.type) continue;
      
      const existingLabel = existing.label.toLowerCase().trim();
      
      // Check for near-exact match
      if (existingLabel === normalizedLabel) return existing;
      
      // Check for substring containment (e.g., "Chris" vs "Chris Li")
      if (existingLabel.includes(normalizedLabel) || normalizedLabel.includes(existingLabel)) {
        // Only merge if same type and high similarity
        const similarity = this.calculateSimilarity(existingLabel, normalizedLabel);
        if (similarity > 0.7) return existing;
      }
    }

    return undefined;
  }

  private calculateSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }

  /**
   * Merge two nodes representing the same entity
   */
  private mergeNodes(existing: Node, incoming: Node): Node {
    return {
      ...existing,
      // Merge attributes (incoming overwrites)
      attributes: { ...existing.attributes, ...incoming.attributes },
      // Update confidence (weighted average favoring more sources)
      confidence: this.weightedConfidence(existing, incoming),
      // Combine sources
      sources: [...existing.sources, ...incoming.sources],
      // Keep earliest firstSeen
      firstSeen: existing.firstSeen < incoming.firstSeen ? existing.firstSeen : incoming.firstSeen,
      // Update lastUpdated
      lastUpdated: new Date(),
      // Update salience (take max)
      salience: Math.max(existing.salience, incoming.salience)
    };
  }

  private weightedConfidence(existing: Node, incoming: Node): number {
    const existingWeight = existing.sources.length;
    const incomingWeight = incoming.sources.length;
    const total = existingWeight + incomingWeight;
    
    return (existing.confidence * existingWeight + incoming.confidence * incomingWeight) / total;
  }

  /**
   * Merge two edges
   */
  private mergeEdges(existing: Edge, incoming: Edge): Edge {
    return {
      ...existing,
      weight: Math.max(existing.weight, incoming.weight),
      confidence: (existing.confidence + incoming.confidence) / 2,
      evidence: [...new Set([...existing.evidence, ...incoming.evidence])],
      sources: [...existing.sources, ...incoming.sources]
    };
  }

  /**
   * Resolve a node reference (could be ID or label)
   */
  private resolveNodeReference(ref: string): Node | undefined {
    // Try exact ID match
    if (this.nodes.has(ref)) {
      return this.nodes.get(ref);
    }

    // Try label match
    const normalized = ref.toLowerCase().trim();
    for (const node of this.nodes.values()) {
      if (node.label.toLowerCase().trim() === normalized) {
        return node;
      }
    }

    return undefined;
  }

  /**
   * Build clusters using connected components + semantic similarity
   */
  buildClusters(): Cluster[] {
    const clusters: Cluster[] = [];
    const visited = new Set<string>();

    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    for (const node of this.nodes.values()) {
      adjacency.set(node.id, new Set());
    }
    for (const edge of this.edges.values()) {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    }

    // Find connected components
    let clusterId = 0;
    for (const nodeId of this.nodes.keys()) {
      if (visited.has(nodeId)) continue;

      const component = new Set<string>();
      const queue = [nodeId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        component.add(current);

        for (const neighbor of adjacency.get(current) || []) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }

      if (component.size > 0) {
        const nodeIds = Array.from(component);
        const nodes = nodeIds.map(id => this.nodes.get(id)!);
        
        clusters.push({
          id: `cluster_${clusterId++}`,
          label: this.inferClusterLabel(nodes),
          nodeIds,
          coherence: this.calculateClusterCoherence(nodeIds),
          themes: this.extractThemes(nodes)
        });
      }
    }

    return clusters.sort((a, b) => b.nodeIds.length - a.nodeIds.length);
  }

  private inferClusterLabel(nodes: Node[]): string {
    // Find the most salient node
    const sorted = [...nodes].sort((a, b) => b.salience - a.salience);
    if (sorted.length > 0) {
      return sorted[0].label;
    }
    return 'Unknown Cluster';
  }

  private calculateClusterCoherence(nodeIds: string[]): number {
    if (nodeIds.length <= 1) return 1;
    
    let edgeCount = 0;
    const nodeSet = new Set(nodeIds);
    
    for (const edge of this.edges.values()) {
      if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
        edgeCount++;
      }
    }

    const maxEdges = (nodeIds.length * (nodeIds.length - 1)) / 2;
    return maxEdges > 0 ? edgeCount / maxEdges : 0;
  }

  private extractThemes(nodes: Node[]): string[] {
    const typeCounts = new Map<string, number>();
    for (const node of nodes) {
      typeCounts.set(node.type, (typeCounts.get(node.type) || 0) + 1);
    }
    
    return Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
  }

  /**
   * Find central nodes using PageRank-like scoring
   */
  findCentralNodes(topN: number = 10): string[] {
    const scores = new Map<string, number>();
    const dampingFactor = 0.85;
    const iterations = 20;

    // Initialize scores
    for (const nodeId of this.nodes.keys()) {
      scores.set(nodeId, 1 / this.nodes.size);
    }

    // Build adjacency
    const inbound = new Map<string, string[]>();
    const outbound = new Map<string, number>();
    
    for (const nodeId of this.nodes.keys()) {
      inbound.set(nodeId, []);
    }
    
    for (const edge of this.edges.values()) {
      inbound.get(edge.target)?.push(edge.source);
      outbound.set(edge.source, (outbound.get(edge.source) || 0) + 1);
    }

    // Iterate
    for (let i = 0; i < iterations; i++) {
      const newScores = new Map<string, number>();
      
      for (const nodeId of this.nodes.keys()) {
        let score = (1 - dampingFactor) / this.nodes.size;
        
        for (const source of inbound.get(nodeId) || []) {
          const sourceOutbound = outbound.get(source) || 1;
          score += dampingFactor * (scores.get(source) || 0) / sourceOutbound;
        }
        
        // Factor in salience
        const node = this.nodes.get(nodeId)!;
        score *= (1 + node.salience);
        
        newScores.set(nodeId, score);
      }
      
      for (const [nodeId, score] of newScores) {
        scores.set(nodeId, score);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([nodeId]) => nodeId);
  }

  /**
   * Detect potential contradictions in the graph
   */
  findContradictions(): Contradiction[] {
    const contradictions: Contradiction[] = [];

    // Look for nodes of opposite types connected to the same entity
    // e.g., "prefers X" and "avoids X" on the same trait
    
    for (const edge1 of this.edges.values()) {
      for (const edge2 of this.edges.values()) {
        if (edge1.id >= edge2.id) continue; // Avoid duplicates
        
        // Same source, contradictory edge types
        if (edge1.source === edge2.source) {
          if (
            (edge1.type === 'prefers' && edge2.type === 'avoids') ||
            (edge1.type === 'believes' && edge2.type === 'avoids' && 
             this.nodes.get(edge1.target)?.type === 'belief')
          ) {
            const node1 = this.nodes.get(edge1.target);
            const node2 = this.nodes.get(edge2.target);
            
            if (node1 && node2) {
              contradictions.push({
                nodeA: edge1.target,
                nodeB: edge2.target,
                description: `Potentially conflicting: prefers "${node1.label}" but avoids "${node2.label}"`
              });
            }
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * Identify gaps in knowledge
   */
  findGaps(): Gap[] {
    const gaps: Gap[] = [];
    const presentTypes = new Set(Array.from(this.nodes.values()).map(n => n.type));

    // Check for missing important types
    const importantTypes: Array<{ type: string; questions: string[] }> = [
      { type: 'goal', questions: ['What are their long-term goals?', 'What do they want to achieve?'] },
      { type: 'belief', questions: ['What do they believe in?', 'What are their core values?'] },
      { type: 'skill', questions: ['What skills do they have?', 'What are they good at?'] },
      { type: 'interest', questions: ['What are they interested in?', 'What do they enjoy?'] },
      { type: 'person', questions: ['Who are the important people in their life?', 'Who do they work with?'] }
    ];

    for (const { type, questions } of importantTypes) {
      const typeNodes = Array.from(this.nodes.values()).filter(n => n.type === type);
      
      if (typeNodes.length === 0) {
        gaps.push({
          area: type,
          description: `No ${type} nodes found`,
          suggestedQuestions: questions
        });
      } else if (typeNodes.length < 3) {
        gaps.push({
          area: type,
          description: `Limited information about ${type}s (only ${typeNodes.length} found)`,
          suggestedQuestions: questions
        });
      }
    }

    // Check for isolated nodes (might need more context)
    const adjacency = new Map<string, number>();
    for (const edge of this.edges.values()) {
      adjacency.set(edge.source, (adjacency.get(edge.source) || 0) + 1);
      adjacency.set(edge.target, (adjacency.get(edge.target) || 0) + 1);
    }

    const isolatedNodes = Array.from(this.nodes.values())
      .filter(n => (adjacency.get(n.id) || 0) === 0);

    if (isolatedNodes.length > 0) {
      gaps.push({
        area: 'connections',
        description: `${isolatedNodes.length} nodes have no connections`,
        suggestedQuestions: isolatedNodes.slice(0, 5).map(n => 
          `How does "${n.label}" relate to other aspects of their life?`
        )
      });
    }

    return gaps;
  }

  /**
   * Export the complete graph
   */
  build(): ContextGraph {
    return {
      version: '1.0.0',
      subject: this.subject,
      generatedAt: new Date(),
      nodes: this.nodes,
      edges: this.edges,
      clusters: this.buildClusters(),
      centralNodes: this.findCentralNodes(),
      temporalPatterns: [], // TODO: Implement temporal analysis
      contradictions: this.findContradictions(),
      gaps: this.findGaps()
    };
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodesByType: this.countByType(this.nodes.values(), 'type'),
      edgesByType: this.countByType(this.edges.values(), 'type')
    };
  }

  private countByType(items: IterableIterator<any>, key: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const type = item[key];
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }
}
