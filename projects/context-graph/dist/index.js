/**
 * Context Graph Generator
 *
 * Main entry point for generating a context graph about a person
 * from various data sources.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ClaudeExtractor } from './extractors/claude-extractor.js';
import { ContextGraphBuilder } from './graph/context-graph.js';
import { OutputGenerator } from './generators/output-generator.js';
async function loadDataSources(workspacePath) {
    const sources = [];
    // Load workspace markdown files
    const workspaceFiles = ['USER.md', 'IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'TOOLS.md'];
    for (const file of workspaceFiles) {
        const filePath = join(workspacePath, file);
        if (existsSync(filePath)) {
            sources.push({
                path: filePath,
                type: 'file',
                content: readFileSync(filePath, 'utf-8')
            });
        }
    }
    // Load memory files
    const memoryPath = join(workspacePath, 'memory');
    if (existsSync(memoryPath)) {
        const memoryFiles = readdirSync(memoryPath).filter(f => f.endsWith('.md'));
        for (const file of memoryFiles) {
            const filePath = join(memoryPath, file);
            sources.push({
                path: filePath,
                type: 'file',
                content: readFileSync(filePath, 'utf-8')
            });
        }
    }
    // Load research files
    const researchPath = join(workspacePath, 'research');
    if (existsSync(researchPath)) {
        const researchFiles = readdirSync(researchPath).filter(f => f.endsWith('.md'));
        for (const file of researchFiles) {
            const filePath = join(researchPath, file);
            sources.push({
                path: filePath,
                type: 'file',
                content: readFileSync(filePath, 'utf-8')
            });
        }
    }
    // Load project README files and package.json
    const projectsPath = join(workspacePath, 'projects');
    if (existsSync(projectsPath)) {
        const projects = readdirSync(projectsPath);
        for (const project of projects) {
            const projectPath = join(projectsPath, project);
            if (statSync(projectPath).isDirectory()) {
                // README
                const readmePath = join(projectPath, 'README.md');
                if (existsSync(readmePath)) {
                    sources.push({
                        path: readmePath,
                        type: 'file',
                        content: readFileSync(readmePath, 'utf-8')
                    });
                }
                // package.json
                const packagePath = join(projectPath, 'package.json');
                if (existsSync(packagePath)) {
                    sources.push({
                        path: packagePath,
                        type: 'file',
                        content: readFileSync(packagePath, 'utf-8')
                    });
                }
            }
        }
    }
    return sources;
}
async function main() {
    console.log('🧠 Context Graph Generator v1.0.0');
    console.log('================================');
    console.log('');
    const workspacePath = process.env.WORKSPACE_PATH || '/home/ubuntu/.openclaw/workspace';
    const outputPath = join(workspacePath, 'projects/context-graph/output');
    const subject = 'Chris';
    // Initialize components
    const extractor = new ClaudeExtractor();
    const graphBuilder = new ContextGraphBuilder(subject);
    const outputGenerator = new OutputGenerator();
    // Load data sources
    console.log('📂 Loading data sources...');
    const sources = await loadDataSources(workspacePath);
    console.log(`   Found ${sources.length} sources`);
    console.log('');
    // Process each source
    let processedCount = 0;
    for (const source of sources) {
        console.log(`📄 Processing: ${source.path}`);
        try {
            // Skip very small or empty files
            if (source.content.trim().length < 50) {
                console.log('   (skipped - too short)');
                continue;
            }
            // Get existing context summary for better extraction
            const existingStats = graphBuilder.getStats();
            const existingContext = existingStats.nodeCount > 0
                ? `Currently known: ${existingStats.nodeCount} nodes across types: ${Object.keys(existingStats.nodesByType).join(', ')}`
                : undefined;
            // Extract from source
            const result = await extractor.extract(source.content, { type: source.type, id: source.path }, existingContext);
            // Merge into graph
            const diff = graphBuilder.merge(result);
            console.log(`   ✓ Extracted: ${result.nodes.length} nodes, ${result.edges.length} edges`);
            console.log(`   ✓ Added: ${diff.addedNodes.length} new nodes, ${diff.addedEdges.length} new edges`);
            processedCount++;
            // Check cost
            const usage = extractor.getUsageStats();
            console.log(`   💰 Running cost: $${usage.estimatedCost}`);
            if (parseFloat(usage.estimatedCost) > 50) {
                console.log('');
                console.log('⚠️  Budget limit reached ($50)');
                break;
            }
        }
        catch (error) {
            console.log(`   ❌ Error: ${error}`);
        }
        console.log('');
    }
    // Build final graph
    console.log('🔨 Building final graph...');
    const graph = graphBuilder.build();
    // Generate outputs
    console.log('📝 Generating outputs...');
    const contextCard = outputGenerator.generateContextCard(graph);
    writeFileSync(join(outputPath, 'context-card.md'), contextCard);
    console.log('   ✓ context-card.md');
    const jsonExport = outputGenerator.generateJSON(graph);
    writeFileSync(join(outputPath, 'graph.json'), jsonExport);
    console.log('   ✓ graph.json');
    const mermaid = outputGenerator.generateMermaid(graph);
    writeFileSync(join(outputPath, 'diagram.md'), mermaid);
    console.log('   ✓ diagram.md');
    const summary = outputGenerator.generateSummary(graph);
    writeFileSync(join(outputPath, 'summary.txt'), summary);
    console.log('   ✓ summary.txt');
    // Final stats
    console.log('');
    console.log('================================');
    console.log('📊 Final Statistics');
    console.log('================================');
    console.log(`Sources processed: ${processedCount}/${sources.length}`);
    console.log(`Total nodes: ${graph.nodes.size}`);
    console.log(`Total edges: ${graph.edges.size}`);
    console.log(`Clusters: ${graph.clusters.length}`);
    console.log(`Knowledge gaps: ${graph.gaps.length}`);
    console.log(`Contradictions: ${graph.contradictions.length}`);
    const finalUsage = extractor.getUsageStats();
    console.log('');
    console.log(`💰 Total cost: $${finalUsage.estimatedCost}`);
    console.log(`📊 Total tokens: ${finalUsage.totalTokens}`);
    console.log('');
    console.log(`✅ Outputs saved to: ${outputPath}`);
}
main().catch(console.error);
