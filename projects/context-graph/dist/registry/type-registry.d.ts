/**
 * Type Registry
 *
 * Manages dynamic node and edge types:
 * - Loads/saves type definitions from JSON
 * - Registers new types proposed by LLM
 * - Consolidates similar types
 * - Provides type lookup and validation
 */
import { TypeDefinition, EdgeTypeDefinition, TypeCategory } from '../types/dynamic-types.js';
export declare class TypeRegistryManager {
    private registry;
    private registryPath;
    private client;
    private dirty;
    constructor(registryPath: string, apiKey?: string);
    /**
     * Load existing registry or create with seed types
     */
    private loadOrCreate;
    /**
     * Save registry to disk
     */
    private saveRegistry;
    /**
     * Get all known node type IDs
     */
    getNodeTypeIds(): string[];
    /**
     * Get all known edge type IDs
     */
    getEdgeTypeIds(): string[];
    /**
     * Get type definition by ID (checks aliases too)
     */
    getNodeType(typeId: string): TypeDefinition | undefined;
    /**
     * Get edge type definition
     */
    getEdgeType(typeId: string): EdgeTypeDefinition | undefined;
    /**
     * Resolve a type name to its canonical ID
     * Returns the ID if found, or proposes registration if new
     */
    resolveOrPropose(typeName: string, isEdgeType?: boolean): {
        id: string;
        isNew: boolean;
        existingType?: TypeDefinition | EdgeTypeDefinition;
    };
    /**
     * Register a new type (called when LLM proposes one)
     */
    registerNodeType(proposal: {
        id: string;
        label: string;
        description: string;
        category: TypeCategory;
        examples?: string[];
        parentType?: string;
    }): TypeDefinition;
    /**
     * Register a new edge type
     */
    registerEdgeType(proposal: {
        id: string;
        label: string;
        description: string;
        directionality?: 'directed' | 'bidirectional';
        examples?: string[];
        inverseType?: string;
    }): EdgeTypeDefinition;
    /**
     * Increment usage count for a type
     */
    recordUsage(typeId: string, isEdgeType?: boolean): void;
    /**
     * Use LLM to consolidate similar types
     */
    consolidateTypes(): Promise<{
        mergedNodeTypes: Array<{
            from: string[];
            to: string;
        }>;
        mergedEdgeTypes: Array<{
            from: string[];
            to: string;
        }>;
    }>;
    /**
     * Generate a summary for the extraction prompt
     */
    getTypeSummaryForPrompt(): string;
    /**
     * Save if dirty
     */
    persist(): void;
    /**
     * Get stats
     */
    getStats(): {
        nodeTypeCount: number;
        edgeTypeCount: number;
        topNodeTypes: Array<{
            id: string;
            usageCount: number;
        }>;
        topEdgeTypes: Array<{
            id: string;
            usageCount: number;
        }>;
        recentlyAdded: string[];
    };
}
