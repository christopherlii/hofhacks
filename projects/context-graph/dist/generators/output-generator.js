/**
 * Output generators for the Context Graph
 *
 * Produces:
 * - Human-readable markdown "context card"
 * - Machine-readable JSON
 * - Mermaid diagram for visualization
 * - Gap analysis report
 */
export class OutputGenerator {
    /**
     * Generate a human-readable context card
     */
    generateContextCard(graph) {
        const lines = [];
        lines.push(`# Context Graph: ${graph.subject}`);
        lines.push(`Generated: ${graph.generatedAt.toISOString()}`);
        lines.push(`Nodes: ${graph.nodes.size} | Edges: ${graph.edges.size}`);
        lines.push('');
        // Identity section
        lines.push('## Identity');
        const identityNodes = this.getNodesByType(graph, ['identity', 'trait']);
        for (const node of identityNodes.slice(0, 10)) {
            lines.push(`- **${node.label}** (${node.type}, confidence: ${(node.confidence * 100).toFixed(0)}%)`);
            for (const [key, value] of Object.entries(node.attributes)) {
                lines.push(`  - ${key}: ${value}`);
            }
        }
        lines.push('');
        // Goals & Aspirations
        lines.push('## Goals & Aspirations');
        const goalNodes = this.getNodesByType(graph, ['goal']);
        if (goalNodes.length === 0) {
            lines.push('*No goals explicitly identified*');
        }
        else {
            for (const node of goalNodes) {
                lines.push(`- **${node.label}** (salience: ${(node.salience * 100).toFixed(0)}%)`);
            }
        }
        lines.push('');
        // Skills & Capabilities
        lines.push('## Skills & Capabilities');
        const skillNodes = this.getNodesByType(graph, ['skill']);
        if (skillNodes.length === 0) {
            lines.push('*No skills explicitly identified*');
        }
        else {
            for (const node of skillNodes) {
                const level = node.attributes.level || 'unknown';
                lines.push(`- ${node.label} (${level})`);
            }
        }
        lines.push('');
        // Beliefs & Values
        lines.push('## Beliefs & Values');
        const beliefNodes = this.getNodesByType(graph, ['belief']);
        if (beliefNodes.length === 0) {
            lines.push('*No explicit beliefs identified*');
        }
        else {
            for (const node of beliefNodes) {
                lines.push(`- ${node.label}`);
            }
        }
        lines.push('');
        // Projects & Work
        lines.push('## Projects & Work');
        const projectNodes = this.getNodesByType(graph, ['project', 'organization']);
        if (projectNodes.length === 0) {
            lines.push('*No projects identified*');
        }
        else {
            for (const node of projectNodes) {
                lines.push(`- **${node.label}** (${node.type})`);
                for (const [key, value] of Object.entries(node.attributes)) {
                    if (value)
                        lines.push(`  - ${key}: ${value}`);
                }
            }
        }
        lines.push('');
        // Behavioral Patterns
        lines.push('## Behavioral Patterns');
        const behaviorNodes = this.getNodesByType(graph, ['behavior', 'pattern', 'preference']);
        if (behaviorNodes.length === 0) {
            lines.push('*No patterns identified*');
        }
        else {
            for (const node of behaviorNodes) {
                lines.push(`- ${node.label}`);
            }
        }
        lines.push('');
        // Network
        lines.push('## Network');
        const personNodes = this.getNodesByType(graph, ['person']);
        if (personNodes.length === 0) {
            lines.push('*No people identified*');
        }
        else {
            for (const node of personNodes) {
                const relationship = node.attributes.relationship || 'known';
                lines.push(`- ${node.label} (${relationship})`);
            }
        }
        lines.push('');
        // Central Themes
        lines.push('## Central Themes');
        if (graph.centralNodes.length > 0) {
            lines.push('Most important nodes by connectivity:');
            for (const nodeId of graph.centralNodes.slice(0, 5)) {
                const node = graph.nodes.get(nodeId);
                if (node) {
                    lines.push(`1. **${node.label}** (${node.type})`);
                }
            }
        }
        lines.push('');
        // Knowledge Gaps
        if (graph.gaps.length > 0) {
            lines.push('## Knowledge Gaps');
            for (const gap of graph.gaps) {
                lines.push(`### ${gap.area}`);
                lines.push(gap.description);
                lines.push('Suggested questions:');
                for (const q of gap.suggestedQuestions) {
                    lines.push(`- ${q}`);
                }
                lines.push('');
            }
        }
        // Contradictions
        if (graph.contradictions.length > 0) {
            lines.push('## Potential Contradictions');
            for (const c of graph.contradictions) {
                lines.push(`- ${c.description}`);
            }
            lines.push('');
        }
        return lines.join('\n');
    }
    /**
     * Generate machine-readable JSON export
     */
    generateJSON(graph) {
        const exportData = {
            version: graph.version,
            subject: graph.subject,
            generatedAt: graph.generatedAt.toISOString(),
            summary: {
                nodeCount: graph.nodes.size,
                edgeCount: graph.edges.size,
                clusterCount: graph.clusters.length,
                gapCount: graph.gaps.length,
                contradictionCount: graph.contradictions.length
            },
            nodes: Array.from(graph.nodes.values()).map(n => ({
                id: n.id,
                type: n.type,
                label: n.label,
                attributes: n.attributes,
                confidence: n.confidence,
                salience: n.salience,
                sourceCount: n.sources.length
            })),
            edges: Array.from(graph.edges.values()).map(e => ({
                id: e.id,
                type: e.type,
                source: e.source,
                target: e.target,
                weight: e.weight,
                confidence: e.confidence,
                evidence: e.evidence
            })),
            clusters: graph.clusters,
            centralNodes: graph.centralNodes,
            gaps: graph.gaps,
            contradictions: graph.contradictions
        };
        return JSON.stringify(exportData, null, 2);
    }
    /**
     * Generate a Mermaid flowchart diagram
     */
    generateMermaid(graph, maxNodes = 30) {
        const lines = [];
        lines.push('```mermaid');
        lines.push('graph TB');
        lines.push('');
        // Style definitions
        lines.push('  %% Node styles');
        lines.push('  classDef identity fill:#e1f5fe,stroke:#01579b');
        lines.push('  classDef trait fill:#f3e5f5,stroke:#7b1fa2');
        lines.push('  classDef skill fill:#e8f5e9,stroke:#2e7d32');
        lines.push('  classDef goal fill:#fff3e0,stroke:#ef6c00');
        lines.push('  classDef project fill:#fce4ec,stroke:#c2185b');
        lines.push('  classDef belief fill:#e0f2f1,stroke:#00695c');
        lines.push('  classDef person fill:#fff9c4,stroke:#f9a825');
        lines.push('  classDef default fill:#f5f5f5,stroke:#757575');
        lines.push('');
        // Select most important nodes
        const sortedNodes = Array.from(graph.nodes.values())
            .sort((a, b) => b.salience - a.salience)
            .slice(0, maxNodes);
        const includedNodeIds = new Set(sortedNodes.map(n => n.id));
        // Add nodes
        lines.push('  %% Nodes');
        for (const node of sortedNodes) {
            const safeLabel = node.label.replace(/"/g, '\\"');
            const safeId = node.id.replace(/-/g, '_');
            lines.push(`  ${safeId}["${safeLabel}"]:::${node.type}`);
        }
        lines.push('');
        // Add edges (only between included nodes)
        lines.push('  %% Edges');
        for (const edge of graph.edges.values()) {
            if (includedNodeIds.has(edge.source) && includedNodeIds.has(edge.target)) {
                const sourceId = edge.source.replace(/-/g, '_');
                const targetId = edge.target.replace(/-/g, '_');
                const label = edge.type;
                lines.push(`  ${sourceId} -->|${label}| ${targetId}`);
            }
        }
        lines.push('```');
        return lines.join('\n');
    }
    /**
     * Generate a compact summary for quick reference
     */
    generateSummary(graph) {
        const lines = [];
        lines.push(`**${graph.subject}** - Context Graph Summary`);
        lines.push('');
        // Quick stats
        lines.push(`📊 ${graph.nodes.size} facts, ${graph.edges.size} connections, ${graph.gaps.length} gaps`);
        lines.push('');
        // Key traits
        const traits = this.getNodesByType(graph, ['trait', 'preference'])
            .slice(0, 5)
            .map(n => n.label);
        if (traits.length > 0) {
            lines.push(`🎯 Key traits: ${traits.join(', ')}`);
        }
        // Goals
        const goals = this.getNodesByType(graph, ['goal'])
            .slice(0, 3)
            .map(n => n.label);
        if (goals.length > 0) {
            lines.push(`🎪 Goals: ${goals.join(', ')}`);
        }
        // Current projects
        const projects = this.getNodesByType(graph, ['project'])
            .slice(0, 3)
            .map(n => n.label);
        if (projects.length > 0) {
            lines.push(`🔨 Projects: ${projects.join(', ')}`);
        }
        // Biggest gap
        if (graph.gaps.length > 0) {
            lines.push(`⚠️ Biggest gap: ${graph.gaps[0].area} - ${graph.gaps[0].description}`);
        }
        return lines.join('\n');
    }
    getNodesByType(graph, types) {
        return Array.from(graph.nodes.values())
            .filter(n => types.includes(n.type))
            .sort((a, b) => b.salience - a.salience);
    }
}
