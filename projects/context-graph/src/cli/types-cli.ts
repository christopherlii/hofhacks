#!/usr/bin/env node
/**
 * Type Registry CLI
 * 
 * Manage dynamic types for the context graph.
 * 
 * Usage:
 *   npm run types -- list [--edges]
 *   npm run types -- add <type_id> <description> [--edge] [--category <cat>]
 *   npm run types -- consolidate
 *   npm run types -- stats
 */

import { join } from 'path';
import { TypeRegistryManager } from '../registry/type-registry.js';
import { TypeCategory } from '../types/dynamic-types.js';

const workspacePath = process.env.WORKSPACE_PATH || '/home/ubuntu/.openclaw/workspace';
const registryPath = join(workspacePath, 'projects/context-graph/output/type-registry.json');

function printUsage() {
  console.log(`
Type Registry CLI - Manage dynamic types

Commands:
  list [--edges]              List all node types (or edge types with --edges)
  add <id> "<desc>"           Add a new type
    --edge                    Add as edge type instead of node type
    --category <cat>          Category: entity|concept|activity|artifact|attribute|temporal
  consolidate                 Run LLM-powered type consolidation
  stats                       Show type registry statistics
  search <query>              Search for types matching query

Examples:
  npm run types -- list
  npm run types -- list --edges
  npm run types -- add restaurant "A dining establishment" --category entity
  npm run types -- add watches "One person follows another" --edge
  npm run types -- consolidate
  npm run types -- stats
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    printUsage();
    return;
  }

  const command = args[0];
  const registry = new TypeRegistryManager(registryPath);

  switch (command) {
    case 'list': {
      const showEdges = args.includes('--edges');
      
      if (showEdges) {
        const types = registry.getEdgeTypeIds();
        console.log(`\n📎 Edge Types (${types.length}):\n`);
        for (const id of types) {
          const type = registry.getEdgeType(id);
          if (type) {
            console.log(`  ${id}`);
            console.log(`    └─ ${type.description}`);
            if (type.aliases.length > 0) {
              console.log(`    └─ aliases: ${type.aliases.join(', ')}`);
            }
            console.log(`    └─ usage: ${type.usageCount}, direction: ${type.directionality}`);
          }
        }
      } else {
        const types = registry.getNodeTypeIds();
        console.log(`\n📦 Node Types (${types.length}):\n`);
        for (const id of types) {
          const type = registry.getNodeType(id);
          if (type) {
            console.log(`  ${id} [${type.category}]`);
            console.log(`    └─ ${type.description}`);
            if (type.aliases.length > 0) {
              console.log(`    └─ aliases: ${type.aliases.join(', ')}`);
            }
            if (type.examples.length > 0) {
              console.log(`    └─ examples: ${type.examples.slice(0, 3).join(', ')}`);
            }
            console.log(`    └─ usage: ${type.usageCount}`);
          }
        }
      }
      console.log('');
      break;
    }

    case 'add': {
      const id = args[1];
      const description = args[2];
      const isEdge = args.includes('--edge');
      const catIndex = args.indexOf('--category');
      const category = catIndex !== -1 ? args[catIndex + 1] as TypeCategory : 'concept';

      if (!id || !description) {
        console.error('❌ Usage: add <id> "<description>"');
        return;
      }

      if (isEdge) {
        const type = registry.registerEdgeType({
          id,
          label: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description,
          directionality: 'directed'
        });
        console.log(`✅ Registered edge type: ${type.id}`);
      } else {
        const type = registry.registerNodeType({
          id,
          label: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description,
          category
        });
        console.log(`✅ Registered node type: ${type.id} [${category}]`);
      }
      
      registry.persist();
      break;
    }

    case 'consolidate': {
      console.log('🔄 Running type consolidation...\n');
      const result = await registry.consolidateTypes();
      
      if (result.mergedNodeTypes.length === 0 && result.mergedEdgeTypes.length === 0) {
        console.log('✅ No types needed consolidation');
      } else {
        for (const merge of result.mergedNodeTypes) {
          console.log(`  📦 Merged ${merge.from.join(', ')} → ${merge.to}`);
        }
        for (const merge of result.mergedEdgeTypes) {
          console.log(`  📎 Merged ${merge.from.join(', ')} → ${merge.to}`);
        }
        registry.persist();
        console.log('\n✅ Consolidation complete');
      }
      break;
    }

    case 'stats': {
      const stats = registry.getStats();
      
      console.log(`
📊 Type Registry Statistics
============================
Node types: ${stats.nodeTypeCount}
Edge types: ${stats.edgeTypeCount}

Top Node Types:
${stats.topNodeTypes.map(t => `  - ${t.id}: ${t.usageCount} uses`).join('\n')}

Top Edge Types:
${stats.topEdgeTypes.map(t => `  - ${t.id}: ${t.usageCount} uses`).join('\n')}

Recently Added:
${stats.recentlyAdded.length > 0 ? stats.recentlyAdded.map(t => `  - ${t}`).join('\n') : '  (none)'}
`);
      break;
    }

    case 'search': {
      const query = args[1]?.toLowerCase();
      if (!query) {
        console.error('❌ Usage: search <query>');
        return;
      }

      const nodeTypes = registry.getNodeTypeIds();
      const edgeTypes = registry.getEdgeTypeIds();

      const matchingNodes = nodeTypes.filter(id => {
        const type = registry.getNodeType(id);
        return id.includes(query) || 
               type?.description.toLowerCase().includes(query) ||
               type?.aliases.some(a => a.includes(query));
      });

      const matchingEdges = edgeTypes.filter(id => {
        const type = registry.getEdgeType(id);
        return id.includes(query) ||
               type?.description.toLowerCase().includes(query) ||
               type?.aliases.some(a => a.includes(query));
      });

      console.log(`\n🔍 Search results for "${query}":\n`);
      
      if (matchingNodes.length > 0) {
        console.log('Node types:');
        for (const id of matchingNodes) {
          const type = registry.getNodeType(id);
          console.log(`  - ${id}: ${type?.description}`);
        }
      }
      
      if (matchingEdges.length > 0) {
        console.log('Edge types:');
        for (const id of matchingEdges) {
          const type = registry.getEdgeType(id);
          console.log(`  - ${id}: ${type?.description}`);
        }
      }

      if (matchingNodes.length === 0 && matchingEdges.length === 0) {
        console.log('  No matching types found');
      }
      console.log('');
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      printUsage();
  }
}

main().catch(console.error);
