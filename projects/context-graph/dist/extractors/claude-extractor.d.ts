/**
 * Claude-powered entity and relationship extraction
 *
 * Uses Claude to intelligently parse text and extract:
 * - Entities (people, projects, skills, beliefs, etc.)
 * - Relationships between entities
 * - Behavioral patterns
 * - Implicit information
 */
import { ExtractionResult, Source } from '../types/graph.js';
export declare class ClaudeExtractor {
    private client;
    private model;
    private totalTokensUsed;
    private estimatedCost;
    constructor(apiKey?: string, model?: string);
    extract(text: string, sourceInfo: Omit<Source, 'timestamp'>, existingContext?: string): Promise<ExtractionResult>;
    private calculateOverallConfidence;
    getUsageStats(): {
        totalTokens: number;
        estimatedCost: string;
    };
}
