/**
 * Output generators for the Context Graph
 *
 * Produces:
 * - Human-readable markdown "context card"
 * - Machine-readable JSON
 * - Mermaid diagram for visualization
 * - Gap analysis report
 */
import { ContextGraph } from '../types/graph.js';
export declare class OutputGenerator {
    /**
     * Generate a human-readable context card
     */
    generateContextCard(graph: ContextGraph): string;
    /**
     * Generate machine-readable JSON export
     */
    generateJSON(graph: ContextGraph): string;
    /**
     * Generate a Mermaid flowchart diagram
     */
    generateMermaid(graph: ContextGraph, maxNodes?: number): string;
    /**
     * Generate a compact summary for quick reference
     */
    generateSummary(graph: ContextGraph): string;
    private getNodesByType;
}
