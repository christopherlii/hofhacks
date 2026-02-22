/**
 * Dynamic Entity Extraction
 * 
 * Enhances the existing extraction with dynamic type support.
 * LLM can propose new types which get registered automatically.
 */

import type { ClaudeRequestBody, ClaudeResponse, EntityNodeType } from '../../../types';
import { EntityStore } from '../entity-store';
import { getTypeRegistry } from './registry';
import { extractJsonObject } from '../../../lib/utils';
import type { TypeCategory } from './types';

interface DynamicExtractionDeps {
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  getCurrentApp: () => string;
}

interface ExtractedEntity {
  label: string;
  type: string;
  isNewType?: boolean;
  newTypeDefinition?: {
    description: string;
    category: TypeCategory;
  };
  confidence: 'high' | 'medium' | 'low';
}

interface ExtractedRelation {
  from: string;
  to: string;
  type: string;
  isNewType?: boolean;
  newTypeDefinition?: {
    description: string;
    directionality: 'directed' | 'bidirectional';
  };
}

interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  newNodeTypes: string[];
  newEdgeTypes: string[];
}

/**
 * Extract entities with dynamic type support
 */
export async function dynamicAiExtract(
  entityStore: EntityStore,
  deps: DynamicExtractionDeps,
  input: string,
): Promise<ExtractionResult | null> {
  const registry = getTypeRegistry();
  const typeSummary = registry.getTypeSummaryForPrompt();

  const prompt = `Extract entities and relationships from this content. Use existing types when they fit, or propose new ones.

${typeSummary}

RULES:
1. PREFER existing types when applicable
2. Only propose NEW types when nothing existing fits
3. Be SPECIFIC - "tv_show" not "content" if it's clearly a show
4. High confidence = explicitly stated, Medium = implied, Low = inferred

OUTPUT JSON:
{
  "entities": [
    {
      "label": "entity name",
      "type": "existing_type_id OR new_type",
      "isNewType": true,  // ONLY if proposing new type
      "newTypeDefinition": {  // ONLY if isNewType=true
        "description": "what this type represents",
        "category": "entity|concept|activity|artifact|attribute|temporal"
      },
      "confidence": "high|medium|low"
    }
  ],
  "relations": [
    {
      "from": "entity label",
      "to": "entity label", 
      "type": "relationship_type",
      "isNewType": true,  // ONLY if proposing new type
      "newTypeDefinition": {
        "description": "what this relationship means",
        "directionality": "directed|bidirectional"
      }
    }
  ]
}

Max 10 entities, 6 relations. Quality over quantity.

CONTENT:
${input}`;

  const response = await deps.claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    system: 'You are an entity extraction system. Return only valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  });

  if (!response?.content?.[0]?.text) return null;

  const parsed = extractJsonObject<{
    entities?: ExtractedEntity[];
    relations?: ExtractedRelation[];
  }>(response.content[0].text);

  if (!parsed) return null;

  const newNodeTypes: string[] = [];
  const newEdgeTypes: string[] = [];
  const contextHint = `${deps.getCurrentApp()}:${Date.now()}`;

  // Process entities
  for (const entity of parsed.entities || []) {
    if (!entity.label || !entity.type) continue;

    let resolvedType: EntityNodeType;
    
    if (entity.isNewType && entity.newTypeDefinition) {
      // Register new type
      const registered = registry.registerNodeType({
        id: entity.type,
        description: entity.newTypeDefinition.description,
        category: entity.newTypeDefinition.category,
        examples: [entity.label],
      });
      newNodeTypes.push(registered.id);
      
      // Map to closest builtin type for storage
      resolvedType = mapToBuiltinType(registered.category);
    } else {
      // Resolve existing type
      const resolved = registry.resolveNodeType(entity.type);
      
      if (resolved.isNew) {
        // LLM used unknown type - register minimally
        const registered = registry.registerNodeType({
          id: entity.type,
          description: `Auto-registered type for: ${entity.label}`,
          category: 'concept',
          examples: [entity.label],
        });
        newNodeTypes.push(registered.id);
        resolvedType = 'topic'; // Default fallback
      } else {
        registry.recordUsage(resolved.id);
        resolvedType = resolved.isBuiltin 
          ? resolved.id as EntityNodeType
          : mapToBuiltinType(resolved.definition?.category || 'concept');
      }
    }

    // Add to entity store with resolved builtin type
    entityStore.addEntity(
      entity.label,
      resolvedType,
      deps.getCurrentApp,
      'dynamic-ai',
      contextHint
    );

    // Mark high confidence as verified
    if (entity.confidence === 'high') {
      const node = entityStore.findNode(entity.label);
      if (node) node.verified = true;
    }
  }

  // Process relations
  for (const rel of parsed.relations || []) {
    if (!rel.from || !rel.to || !rel.type) continue;

    if (rel.isNewType && rel.newTypeDefinition) {
      const registered = registry.registerEdgeType({
        id: rel.type,
        description: rel.newTypeDefinition.description,
        directionality: rel.newTypeDefinition.directionality,
        examples: [`${rel.from} → ${rel.to}`],
      });
      newEdgeTypes.push(registered.id);
    } else {
      const resolved = registry.resolveEdgeType(rel.type);
      if (resolved.isNew) {
        const registered = registry.registerEdgeType({
          id: rel.type,
          description: `Auto-registered relation: ${rel.from} ${rel.type} ${rel.to}`,
          examples: [`${rel.from} → ${rel.to}`],
        });
        newEdgeTypes.push(registered.id);
      } else {
        registry.recordUsage(resolved.id, true);
      }
    }

    entityStore.addRelation(rel.from, rel.to, rel.type);
  }

  // Persist registry changes
  registry.persist();

  if (newNodeTypes.length > 0 || newEdgeTypes.length > 0) {
    console.log(`[DynamicExtract] New types: nodes=[${newNodeTypes.join(',')}] edges=[${newEdgeTypes.join(',')}]`);
  }

  return {
    entities: parsed.entities || [],
    relations: parsed.relations || [],
    newNodeTypes,
    newEdgeTypes,
  };
}

/**
 * Map a TypeCategory to the closest builtin EntityNodeType
 */
function mapToBuiltinType(category: TypeCategory): EntityNodeType {
  const mapping: Record<TypeCategory, EntityNodeType> = {
    entity: 'person',      // Most entities are people or orgs
    concept: 'topic',      // Ideas, beliefs -> topic
    activity: 'content',   // Events, activities -> content
    artifact: 'project',   // Creations -> project
    attribute: 'skill',    // Traits, skills
    temporal: 'content',   // Time-based events
  };
  return mapping[category] || 'topic';
}
