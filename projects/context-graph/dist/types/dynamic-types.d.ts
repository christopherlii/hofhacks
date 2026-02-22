/**
 * Dynamic Type System for Context Graph
 *
 * Instead of hardcoded NodeType/EdgeType enums, types are:
 * - Learned from data
 * - Created by LLM during extraction
 * - Consolidated to avoid duplication
 * - Persisted across runs
 */
export interface TypeDefinition {
    id: string;
    label: string;
    description: string;
    category: TypeCategory;
    examples: string[];
    createdAt: Date;
    usageCount: number;
    aliases: string[];
    parentType?: string;
}
export type TypeCategory = 'entity' | 'concept' | 'activity' | 'artifact' | 'attribute' | 'temporal' | 'relational';
export interface EdgeTypeDefinition extends TypeDefinition {
    category: 'relational';
    directionality: 'directed' | 'bidirectional';
    sourceCategories?: TypeCategory[];
    targetCategories?: TypeCategory[];
    inverseType?: string;
}
export interface TypeRegistry {
    version: string;
    lastUpdated: Date;
    nodeTypes: Record<string, TypeDefinition>;
    edgeTypes: Record<string, EdgeTypeDefinition>;
}
export declare const SEED_NODE_TYPES: TypeDefinition[];
export declare const SEED_EDGE_TYPES: EdgeTypeDefinition[];
/**
 * Normalize a type name to canonical form
 */
export declare function normalizeTypeName(name: string): string;
/**
 * Check if two type names are similar (for deduplication)
 */
export declare function areTypesSimilar(a: string, b: string): boolean;
