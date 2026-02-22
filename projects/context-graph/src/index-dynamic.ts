/**
 * Context Graph Generator - Dynamic Types Edition
 * 
 * Main entry point using dynamic type extraction.
 * Types are learned and evolved as data is processed.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { DynamicExtractor } from './extractors/dynamic-extractor.js';
import { TypeRegistryManager } from './registry/type-registry.js';
import { ContextGraphBuilder } from './graph/context-graph.js';
import { OutputGenerator } from './generators/output-generator.js';

interface DataSource {
  path: string;
  type: 'conversation' | 'file' | 'browser' | 'action' | 'inference';
  content: string;
}

async function loadDataSources(workspacePath: string): Promise<DataSource[]> {
  const sources: DataSource[] = [];
  
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
  
  // Load project README files
  const projectsPath = join(workspacePath, 'projects');
  if (existsSync(projectsPath)) {
    const projects = readdirSync(projectsPath);
    for (const project of projects) {
      const projectPath = join(projectsPath, project);
      if (statSync(projectPath).isDirectory()) {
        const readmePath = join(projectPath, 'README.md');
        if (existsSync(readmePath)) {
          sources.push({
            path: readmePath,
            type: 'file',
            content: readFileSync(readmePath, 'utf-8')
          });
        }
      }
    }
  }
  
  return sources;
}

async function main() {
  console.log('🧠 Context Graph Generator v2.0.0 (Dynamic Types)');
  console.log('=================================================');
  console.log('');
  
  const workspacePath = process.env.WORKSPACE_PATH || '/home/ubuntu/.openclaw/workspace';
  const outputPath = join(workspacePath, 'projects/context-graph/output');
  const registryPath = join(outputPath, 'type-registry.json');
  const subject = 'Chris';
  
  // Ensure output directory exists
  if (!existsSync(outputPath)) {
    mkdirSync(outputPath, { recursive: true });
  }
  
  // Initialize components
  const registry = new TypeRegistryManager(registryPath);
  const extractor = new DynamicExtractor(registry);
  const graphBuilder = new ContextGraphBuilder(subject);
  const outputGenerator = new OutputGenerator();
  
  // Load data sources
  console.log('📂 Loading data sources...');
  const sources = await loadDataSources(workspacePath);
  console.log(`   Found ${sources.length} sources`);
  console.log('');
  
  // Track new types discovered
  let totalNewNodeTypes: string[] = [];
  let totalNewEdgeTypes: string[] = [];
  
  // Process each source
  let processedCount = 0;
  for (const source of sources) {
    console.log(`📄 Processing: ${source.path}`);
    
    try {
      if (source.content.trim().length < 50) {
        console.log('   (skipped - too short)');
        continue;
      }
      
      const existingStats = graphBuilder.getStats();
      const existingContext = existingStats.nodeCount > 0
        ? `Currently known: ${existingStats.nodeCount} nodes across types: ${Object.keys(existingStats.nodesByType).join(', ')}`
        : undefined;
      
      const result = await extractor.extract(
        source.content,
        { type: source.type, id: source.path },
        existingContext
      );
      
      const diff = graphBuilder.merge(result);
      
      console.log(`   ✓ Extracted: ${result.nodes.length} nodes, ${result.edges.length} edges`);
      console.log(`   ✓ Added: ${diff.addedNodes.length} new nodes, ${diff.addedEdges.length} new edges`);
      
      if (result.newNodeTypes.length > 0) {
        console.log(`   ✨ New node types: ${result.newNodeTypes.map(t => t.id).join(', ')}`);
        totalNewNodeTypes.push(...result.newNodeTypes.map(t => t.id));
      }
      if (result.newEdgeTypes.length > 0) {
        console.log(`   ✨ New edge types: ${result.newEdgeTypes.map(t => t.id).join(', ')}`);
        totalNewEdgeTypes.push(...result.newEdgeTypes.map(t => t.id));
      }
      
      processedCount++;
      
      const usage = extractor.getUsageStats();
      console.log(`   💰 Running cost: $${usage.estimatedCost}`);
      
      if (parseFloat(usage.estimatedCost) > 50) {
        console.log('');
        console.log('⚠️  Budget limit reached ($50)');
        break;
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
    
    console.log('');
  }
  
  // Consolidate similar types
  console.log('🔄 Consolidating similar types...');
  const consolidation = await registry.consolidateTypes();
  if (consolidation.mergedNodeTypes.length > 0 || consolidation.mergedEdgeTypes.length > 0) {
    console.log(`   Merged ${consolidation.mergedNodeTypes.length} node types, ${consolidation.mergedEdgeTypes.length} edge types`);
  } else {
    console.log('   No types needed consolidation');
  }
  console.log('');
  
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
  console.log('=================================================');
  console.log('📊 Final Statistics');
  console.log('=================================================');
  console.log(`Sources processed: ${processedCount}/${sources.length}`);
  console.log(`Total nodes: ${graph.nodes.size}`);
  console.log(`Total edges: ${graph.edges.size}`);
  console.log(`Clusters: ${graph.clusters.length}`);
  
  const registryStats = registry.getStats();
  console.log('');
  console.log('📚 Type Registry:');
  console.log(`   Node types: ${registryStats.nodeTypeCount}`);
  console.log(`   Edge types: ${registryStats.edgeTypeCount}`);
  console.log(`   New this run: ${[...new Set(totalNewNodeTypes)].length} node, ${[...new Set(totalNewEdgeTypes)].length} edge`);
  
  if (registryStats.topNodeTypes.length > 0) {
    console.log(`   Top node types: ${registryStats.topNodeTypes.map(t => `${t.id}(${t.usageCount})`).join(', ')}`);
  }
  
  const finalUsage = extractor.getUsageStats();
  console.log('');
  console.log(`💰 Total cost: $${finalUsage.estimatedCost}`);
  console.log(`📊 Total tokens: ${finalUsage.totalTokens}`);
  console.log('');
  console.log(`✅ Outputs saved to: ${outputPath}`);
}

main().catch(console.error);
