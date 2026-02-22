/**
 * Dynamic Entity Extractor
 *
 * Uses LLM to extract entities and relationships with dynamic types.
 * Instead of hardcoded type enums, types are:
 * - Looked up from the TypeRegistry
 * - Proposed by LLM when no existing type fits
 * - Automatically registered for future use
 */
import { ExtractionResult, Source } from '../types/graph.js';
import { TypeRegistryManager } from '../registry/type-registry.js';
export interface DynamicExtractionResult extends ExtractionResult {
    newNodeTypes: Array<{
        id: string;
        label: string;
        description: string;
        category: string;
    }>;
    newEdgeTypes: Array<{
        id: string;
        label: string;
        description: string;
    }>;
}
export declare class DynamicExtractor {
    private client;
    private model;
    private registry;
    private totalTokensUsed;
    private estimatedCost;
    constructor(registry: TypeRegistryManager, apiKey?: string, model?: string);
    extract(text: string, sourceInfo: Omit<Source, 'timestamp'>, existingContext?: string): Promise<DynamicExtractionResult>;
    private calculateConfidence;
    getUsageStats(): {
        totalTokens: number;
        estimatedCost: string;
    };
}
