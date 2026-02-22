/**
 * Type Registry Manager
 * 
 * Manages dynamic node and edge types:
 * - Loads/saves type definitions
 * - Registers new types proposed by LLM
 * - Consolidates similar types
 * - Provides type lookup and validation
 */

import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { EntityNodeType } from '../../../types';
import {
  TypeDefinition,
  EdgeTypeDefinition,
  TypeRegistry,
  TypeCategory,
  createBaseTypeDefinitions,
  createBaseEdgeDefinitions,
  normalizeTypeName,
  areTypesSimilar,
} from './types';

export class TypeRegistryManager {
  private registry: TypeRegistry;
  private registryPath: string;
  private dirty = false;

  constructor() {
    const userDataPath = app?.getPath('userData') ?? './data';
    const graphDataPath = join(userDataPath, 'graph-data');
    
    if (!existsSync(graphDataPath)) {
      mkdirSync(graphDataPath, { recursive: true });
    }
    
    this.registryPath = join(graphDataPath, 'type-registry.json');
    this.registry = this.loadOrCreate();
  }

  private loadOrCreate(): TypeRegistry {
    if (existsSync(this.registryPath)) {
      try {
        const data = JSON.parse(readFileSync(this.registryPath, 'utf-8'));
        console.log(`[TypeRegistry] Loaded: ${Object.keys(data.nodeTypes).length} node types, ${Object.keys(data.edgeTypes).length} edge types`);
        return data;
      } catch (e) {
        console.warn('[TypeRegistry] Failed to load, creating new');
      }
    }

    const registry: TypeRegistry = {
      version: '1.0.0',
      lastUpdated: Date.now(),
      nodeTypes: createBaseTypeDefinitions(),
      edgeTypes: createBaseEdgeDefinitions(),
    };

    this.saveRegistry(registry);
    console.log('[TypeRegistry] Created with base types');
    return registry;
  }

  private saveRegistry(registry?: TypeRegistry): void {
    const toSave = registry || this.registry;
    toSave.lastUpdated = Date.now();
    writeFileSync(this.registryPath, JSON.stringify(toSave, null, 2));
  }

  /**
   * Get all known node type IDs
   */
  getNodeTypeIds(): string[] {
    return Object.keys(this.registry.nodeTypes);
  }

  /**
   * Get all known edge type IDs
   */
  getEdgeTypeIds(): string[] {
    return Object.keys(this.registry.edgeTypes);
  }

  /**
   * Check if a type is a valid EntityNodeType (builtin)
   */
  isBuiltinType(typeId: string): typeId is EntityNodeType {
    const def = this.registry.nodeTypes[normalizeTypeName(typeId)];
    return def?.isBuiltin ?? false;
  }

  /**
   * Get type definition by ID (checks aliases too)
   */
  getNodeType(typeId: string): TypeDefinition | undefined {
    const normalized = normalizeTypeName(typeId);
    
    if (this.registry.nodeTypes[normalized]) {
      return this.registry.nodeTypes[normalized];
    }

    for (const type of Object.values(this.registry.nodeTypes)) {
      if (type.aliases.map(normalizeTypeName).includes(normalized)) {
        return type;
      }
    }

    return undefined;
  }

  /**
   * Get edge type definition
   */
  getEdgeType(typeId: string): EdgeTypeDefinition | undefined {
    const normalized = normalizeTypeName(typeId);
    
    if (this.registry.edgeTypes[normalized]) {
      return this.registry.edgeTypes[normalized];
    }

    for (const type of Object.values(this.registry.edgeTypes)) {
      if (type.aliases.map(normalizeTypeName).includes(normalized)) {
        return type;
      }
    }

    return undefined;
  }

  /**
   * Resolve a type name to its canonical ID
   */
  resolveNodeType(typeName: string): { 
    id: string; 
    isNew: boolean; 
    isBuiltin: boolean;
    definition?: TypeDefinition;
  } {
    const normalized = normalizeTypeName(typeName);
    
    // Check exact match
    const existing = this.getNodeType(normalized);
    if (existing) {
      return { 
        id: existing.id, 
        isNew: false, 
        isBuiltin: existing.isBuiltin,
        definition: existing 
      };
    }

    // Check similarity with existing types
    for (const type of Object.values(this.registry.nodeTypes)) {
      if (areTypesSimilar(normalized, type.id)) {
        return { 
          id: type.id, 
          isNew: false, 
          isBuiltin: type.isBuiltin,
          definition: type 
        };
      }
    }

    return { id: normalized, isNew: true, isBuiltin: false };
  }

  /**
   * Resolve an edge type name
   */
  resolveEdgeType(typeName: string): {
    id: string;
    isNew: boolean;
    definition?: EdgeTypeDefinition;
  } {
    const normalized = normalizeTypeName(typeName);
    
    const existing = this.getEdgeType(normalized);
    if (existing) {
      return { id: existing.id, isNew: false, definition: existing };
    }

    for (const type of Object.values(this.registry.edgeTypes)) {
      if (areTypesSimilar(normalized, type.id)) {
        return { id: type.id, isNew: false, definition: type };
      }
    }

    return { id: normalized, isNew: true };
  }

  /**
   * Register a new node type
   */
  registerNodeType(proposal: {
    id: string;
    label?: string;
    description: string;
    category?: TypeCategory;
    examples?: string[];
    parentType?: string;
  }): TypeDefinition {
    const normalized = normalizeTypeName(proposal.id);
    
    const existing = this.getNodeType(normalized);
    if (existing) {
      existing.usageCount++;
      this.dirty = true;
      return existing;
    }

    const newType: TypeDefinition = {
      id: normalized,
      label: proposal.label || normalized.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: proposal.description,
      category: proposal.category || 'concept',
      examples: proposal.examples || [],
      createdAt: Date.now(),
      usageCount: 1,
      aliases: [],
      parentType: proposal.parentType,
      isBuiltin: false,
    };

    this.registry.nodeTypes[normalized] = newType;
    this.dirty = true;
    console.log(`[TypeRegistry] New node type: ${normalized} (${newType.category})`);
    
    return newType;
  }

  /**
   * Register a new edge type
   */
  registerEdgeType(proposal: {
    id: string;
    label?: string;
    description: string;
    directionality?: 'directed' | 'bidirectional';
    examples?: string[];
    inverseType?: string;
  }): EdgeTypeDefinition {
    const normalized = normalizeTypeName(proposal.id);
    
    const existing = this.getEdgeType(normalized);
    if (existing) {
      existing.usageCount++;
      this.dirty = true;
      return existing;
    }

    const newType: EdgeTypeDefinition = {
      id: normalized,
      label: proposal.label || normalized.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: proposal.description,
      directionality: proposal.directionality || 'directed',
      examples: proposal.examples || [],
      createdAt: Date.now(),
      usageCount: 1,
      aliases: [],
      inverseType: proposal.inverseType,
    };

    this.registry.edgeTypes[normalized] = newType;
    this.dirty = true;
    console.log(`[TypeRegistry] New edge type: ${normalized}`);
    
    return newType;
  }

  /**
   * Increment usage count for a type
   */
  recordUsage(typeId: string, isEdgeType = false): void {
    const types = isEdgeType ? this.registry.edgeTypes : this.registry.nodeTypes;
    const normalized = normalizeTypeName(typeId);
    
    if (types[normalized]) {
      types[normalized].usageCount++;
      this.dirty = true;
    }
  }

  /**
   * Get type summary for LLM extraction prompts
   */
  getTypeSummaryForPrompt(): string {
    const nodeTypes = Object.values(this.registry.nodeTypes)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 15);
    
    const edgeTypes = Object.values(this.registry.edgeTypes)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    return `KNOWN ENTITY TYPES (use these when applicable, or propose new ones):
${nodeTypes.map(t => `- ${t.id}: ${t.description}`).join('\n')}

KNOWN RELATIONSHIP TYPES:
${edgeTypes.map(t => `- ${t.id}: ${t.description}`).join('\n')}`;
  }

  /**
   * Merge similar types (call periodically)
   */
  consolidateTypes(): {
    mergedNodeTypes: string[];
    mergedEdgeTypes: string[];
  } {
    const mergedNodeTypes: string[] = [];
    const mergedEdgeTypes: string[] = [];

    // Find and merge similar node types (non-builtin only)
    const nodeTypeIds = Object.keys(this.registry.nodeTypes);
    for (let i = 0; i < nodeTypeIds.length; i++) {
      const typeA = this.registry.nodeTypes[nodeTypeIds[i]];
      if (typeA.isBuiltin) continue;
      
      for (let j = i + 1; j < nodeTypeIds.length; j++) {
        const typeB = this.registry.nodeTypes[nodeTypeIds[j]];
        if (typeB.isBuiltin) continue;
        
        if (areTypesSimilar(typeA.id, typeB.id)) {
          // Merge B into A (keep the one with more usage)
          const [keep, merge] = typeA.usageCount >= typeB.usageCount 
            ? [typeA, typeB] 
            : [typeB, typeA];
          
          keep.aliases = [...new Set([...keep.aliases, merge.id, ...merge.aliases])];
          keep.examples = [...new Set([...keep.examples, ...merge.examples])].slice(0, 10);
          keep.usageCount += merge.usageCount;
          
          delete this.registry.nodeTypes[merge.id];
          mergedNodeTypes.push(`${merge.id} → ${keep.id}`);
          this.dirty = true;
        }
      }
    }

    // Similar for edge types
    const edgeTypeIds = Object.keys(this.registry.edgeTypes);
    for (let i = 0; i < edgeTypeIds.length; i++) {
      const typeA = this.registry.edgeTypes[edgeTypeIds[i]];
      
      for (let j = i + 1; j < edgeTypeIds.length; j++) {
        const typeB = this.registry.edgeTypes[edgeTypeIds[j]];
        
        if (areTypesSimilar(typeA.id, typeB.id)) {
          const [keep, merge] = typeA.usageCount >= typeB.usageCount 
            ? [typeA, typeB] 
            : [typeB, typeA];
          
          keep.aliases = [...new Set([...keep.aliases, merge.id, ...merge.aliases])];
          keep.usageCount += merge.usageCount;
          
          delete this.registry.edgeTypes[merge.id];
          mergedEdgeTypes.push(`${merge.id} → ${keep.id}`);
          this.dirty = true;
        }
      }
    }

    if (this.dirty) {
      this.persist();
    }

    return { mergedNodeTypes, mergedEdgeTypes };
  }

  /**
   * Save if dirty
   */
  persist(): void {
    if (this.dirty) {
      this.saveRegistry();
      this.dirty = false;
    }
  }

  /**
   * Get stats
   */
  getStats(): {
    nodeTypeCount: number;
    edgeTypeCount: number;
    customNodeTypes: number;
    topNodeTypes: Array<{ id: string; usageCount: number }>;
    topEdgeTypes: Array<{ id: string; usageCount: number }>;
  } {
    const nodeTypes = Object.values(this.registry.nodeTypes);
    const edgeTypes = Object.values(this.registry.edgeTypes);

    return {
      nodeTypeCount: nodeTypes.length,
      edgeTypeCount: edgeTypes.length,
      customNodeTypes: nodeTypes.filter(t => !t.isBuiltin).length,
      topNodeTypes: nodeTypes
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5)
        .map(t => ({ id: t.id, usageCount: t.usageCount })),
      topEdgeTypes: edgeTypes
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5)
        .map(t => ({ id: t.id, usageCount: t.usageCount })),
    };
  }
}

// Singleton instance
let registryInstance: TypeRegistryManager | null = null;

export function getTypeRegistry(): TypeRegistryManager {
  if (!registryInstance) {
    registryInstance = new TypeRegistryManager();
  }
  return registryInstance;
}
