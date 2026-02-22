/**
 * Dynamic Entity Extractor
 * 
 * Uses LLM to extract entities and relationships with dynamic types.
 * Instead of hardcoded type enums, types are:
 * - Looked up from the TypeRegistry
 * - Proposed by LLM when no existing type fits
 * - Automatically registered for future use
 */

import Anthropic from '@anthropic-ai/sdk';
import { Node, Edge, ExtractionResult, Source } from '../types/graph.js';
import { TypeRegistryManager } from '../registry/type-registry.js';
import { normalizeTypeName, TypeCategory } from '../types/dynamic-types.js';
import { generateId } from '../utils/ids.js';

const DYNAMIC_EXTRACTION_PROMPT = `You are an expert at building knowledge graphs about people and conversations.
Given text, extract structured information with DYNAMIC typing.

OUTPUT FORMAT (JSON):
{
  "entities": [
    {
      "label": "<concise label>",
      "type": "<existing_type_id OR proposed new type>",
      "isNewType": <true if proposing new type>,
      "newTypeDefinition": {  // ONLY if isNewType=true
        "label": "Human Readable",
        "description": "What this type represents",
        "category": "entity|concept|activity|artifact|attribute|temporal"
      },
      "attributes": { <key-value details> },
      "confidence": <0-1>,
      "salience": <0-1, how central/important>
    }
  ],
  "relationships": [
    {
      "sourceLabel": "<entity label>",
      "targetLabel": "<entity label>",
      "type": "<existing_edge_type OR proposed new type>",
      "isNewType": <true if proposing new type>,
      "newTypeDefinition": {  // ONLY if isNewType=true
        "label": "Human Readable",
        "description": "What this relationship means",
        "directionality": "directed|bidirectional"
      },
      "evidence": "<quote or paraphrase from text>",
      "weight": <0-1, strength>,
      "confidence": <0-1>
    }
  ],
  "insights": ["<observations not captured as entities/relationships>"]
}

GUIDELINES:
1. PREFER existing types when they fit (even loosely)
2. Only propose NEW types when nothing existing applies
3. Be SPECIFIC - "tv_show" not "content", "poker_game" not "event" if appropriate
4. Extract IMPLICIT information (if discussing NYU project, person likely attends NYU)
5. Relationships should have clear directionality and evidence
6. High salience = defining characteristic, low = incidental mention`;

export interface DynamicExtractionResult extends ExtractionResult {
  newNodeTypes: Array<{ id: string; label: string; description: string; category: string }>;
  newEdgeTypes: Array<{ id: string; label: string; description: string }>;
}

export class DynamicExtractor {
  private client: Anthropic;
  private model: string;
  private registry: TypeRegistryManager;
  private totalTokensUsed: number = 0;
  private estimatedCost: number = 0;

  constructor(
    registry: TypeRegistryManager,
    apiKey?: string,
    model: string = 'claude-sonnet-4-20250514'
  ) {
    this.registry = registry;
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.model = model;
  }

  async extract(
    text: string,
    sourceInfo: Omit<Source, 'timestamp'>,
    existingContext?: string
  ): Promise<DynamicExtractionResult> {
    // Get type summary from registry
    const typeSummary = this.registry.getTypeSummaryForPrompt();
    
    const contextSection = existingContext
      ? `\n\nEXISTING KNOWLEDGE (avoid duplicating):\n${existingContext}`
      : '';

    const fullPrompt = `${DYNAMIC_EXTRACTION_PROMPT}

${typeSummary}
${contextSection}

TEXT TO ANALYZE:
${text}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: fullPrompt }]
    });

    // Track usage
    this.totalTokensUsed += response.usage.input_tokens + response.usage.output_tokens;
    this.estimatedCost +=
      response.usage.input_tokens * 0.000003 +
      response.usage.output_tokens * 0.000015;

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON
    let jsonStr = content.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    const parsed = JSON.parse(jsonStr.trim());
    const timestamp = new Date();
    const source: Source = { ...sourceInfo, timestamp };

    const newNodeTypes: Array<{ id: string; label: string; description: string; category: string }> = [];
    const newEdgeTypes: Array<{ id: string; label: string; description: string }> = [];

    // Process entities
    const nodes: Node[] = [];
    for (const entity of parsed.entities || []) {
      let typeId: string;

      if (entity.isNewType && entity.newTypeDefinition) {
        // Register new type
        const def = entity.newTypeDefinition;
        const registered = this.registry.registerNodeType({
          id: entity.type,
          label: def.label,
          description: def.description,
          category: def.category as TypeCategory,
          examples: [entity.label]
        });
        typeId = registered.id;
        newNodeTypes.push({
          id: registered.id,
          label: def.label,
          description: def.description,
          category: def.category
        });
      } else {
        // Resolve existing type
        const resolved = this.registry.resolveOrPropose(entity.type, false);
        typeId = resolved.id;
        
        if (resolved.isNew) {
          // LLM said existing but we don't have it - register minimally
          const registered = this.registry.registerNodeType({
            id: entity.type,
            label: entity.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            description: `Auto-registered type for: ${entity.label}`,
            category: 'concept',
            examples: [entity.label]
          });
          typeId = registered.id;
          newNodeTypes.push({
            id: registered.id,
            label: registered.label,
            description: registered.description,
            category: 'concept'
          });
        } else {
          this.registry.recordUsage(typeId, false);
        }
      }

      nodes.push({
        id: generateId(typeId, entity.label),
        type: typeId as any,
        label: entity.label,
        attributes: entity.attributes || {},
        confidence: entity.confidence || 0.5,
        sources: [source],
        firstSeen: timestamp,
        lastUpdated: timestamp,
        salience: entity.salience || 0.5
      });
    }

    // Process relationships
    const edges: Edge[] = [];
    for (const rel of parsed.relationships || []) {
      let typeId: string;

      if (rel.isNewType && rel.newTypeDefinition) {
        const def = rel.newTypeDefinition;
        const registered = this.registry.registerEdgeType({
          id: rel.type,
          label: def.label,
          description: def.description,
          directionality: def.directionality || 'directed',
          examples: [`${rel.sourceLabel} → ${rel.targetLabel}`]
        });
        typeId = registered.id;
        newEdgeTypes.push({
          id: registered.id,
          label: def.label,
          description: def.description
        });
      } else {
        const resolved = this.registry.resolveOrPropose(rel.type, true);
        typeId = resolved.id;

        if (resolved.isNew) {
          const registered = this.registry.registerEdgeType({
            id: rel.type,
            label: rel.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            description: `Auto-registered edge for: ${rel.sourceLabel} → ${rel.targetLabel}`,
            examples: [`${rel.sourceLabel} → ${rel.targetLabel}`]
          });
          typeId = registered.id;
          newEdgeTypes.push({
            id: registered.id,
            label: registered.label,
            description: registered.description
          });
        } else {
          this.registry.recordUsage(typeId, true);
        }
      }

      const sourceNode = nodes.find(n => n.label === rel.sourceLabel);
      const targetNode = nodes.find(n => n.label === rel.targetLabel);

      edges.push({
        id: generateId('edge', `${rel.sourceLabel}-${typeId}-${rel.targetLabel}`),
        type: typeId as any,
        source: sourceNode?.id || generateId('unknown', rel.sourceLabel),
        target: targetNode?.id || generateId('unknown', rel.targetLabel),
        weight: rel.weight || 0.5,
        confidence: rel.confidence || 0.5,
        evidence: [rel.evidence],
        sources: [source]
      });
    }

    // Persist registry changes
    this.registry.persist();

    return {
      nodes,
      edges,
      rawInsights: parsed.insights || [],
      confidence: this.calculateConfidence(nodes, edges),
      newNodeTypes,
      newEdgeTypes
    };
  }

  private calculateConfidence(nodes: Node[], edges: Edge[]): number {
    if (nodes.length === 0) return 0;
    const nodeAvg = nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length;
    const edgeAvg = edges.length > 0
      ? edges.reduce((sum, e) => sum + e.confidence, 0) / edges.length
      : 0;
    return (nodeAvg + edgeAvg) / 2;
  }

  getUsageStats() {
    return {
      totalTokens: this.totalTokensUsed,
      estimatedCost: this.estimatedCost.toFixed(4)
    };
  }
}
