/**
 * Dynamic Type System for Context Graph
 * 
 * Extends the base EntityNodeType with learned/custom types.
 * Types can be:
 * - Created by LLM during extraction
 * - Manually added by users
 * - Consolidated to avoid duplication
 */

import type { EntityNodeType } from '../../../types';

export interface TypeDefinition {
  id: string;                    // Canonical ID (lowercase, underscored)
  label: string;                 // Human-readable name
  description: string;           // What this type represents
  category: TypeCategory;        // High-level grouping
  examples: string[];            // Example instances
  createdAt: number;             // Unix timestamp
  usageCount: number;            // How often it's been used
  aliases: string[];             // Merged types that map here
  parentType?: string;           // For hierarchical types (tv_show -> content)
  isBuiltin: boolean;            // True for base EntityNodeType values
}

export type TypeCategory = 
  | 'entity'       // People, organizations, places
  | 'concept'      // Ideas, beliefs, values, topics
  | 'activity'     // Actions, events, behaviors
  | 'artifact'     // Projects, creations, content
  | 'attribute'    // Traits, skills, preferences
  | 'temporal';    // Time-based (events, patterns)

export interface EdgeTypeDefinition {
  id: string;
  label: string;
  description: string;
  directionality: 'directed' | 'bidirectional';
  examples: string[];
  createdAt: number;
  usageCount: number;
  aliases: string[];
  inverseType?: string;          // e.g., "recommended_by" is inverse of "recommended"
}

export interface TypeRegistry {
  version: string;
  lastUpdated: number;
  nodeTypes: Record<string, TypeDefinition>;
  edgeTypes: Record<string, EdgeTypeDefinition>;
}

// Map base types to categories
const BASE_TYPE_CATEGORIES: Record<EntityNodeType, TypeCategory> = {
  person: 'entity',
  topic: 'concept',
  app: 'artifact',
  content: 'artifact',
  place: 'entity',
  project: 'artifact',
  goal: 'concept',
  skill: 'attribute',
  organization: 'entity',
};

// Seed definitions for base types
export function createBaseTypeDefinitions(): Record<string, TypeDefinition> {
  const baseTypes: EntityNodeType[] = [
    'person', 'topic', 'app', 'content', 'place', 
    'project', 'goal', 'skill', 'organization'
  ];
  
  const definitions: Record<string, TypeDefinition> = {};
  const now = Date.now();
  
  const descriptions: Record<EntityNodeType, string> = {
    person: 'A human individual',
    topic: 'A subject of discussion or interest',
    app: 'An application or software',
    content: 'Media content like videos, articles, shows',
    place: 'A physical or virtual location',
    project: 'Something being built or worked on',
    goal: 'An objective or aspiration',
    skill: 'A technical or soft skill',
    organization: 'A company, school, team, or group',
  };
  
  const examples: Record<EntityNodeType, string[]> = {
    person: ['Chris', 'Benjamin Xu', 'Katie'],
    topic: ['basketball', 'API integration', 'NFL'],
    app: ['VS Code', 'Telegram', 'Chrome'],
    content: ['The Bear', 'Breaking Bad', 'YouTube video'],
    place: ['Korean restaurant', 'NYU', 'Discord server'],
    project: ['nyu-swipes', 'context-graph', 'hofhacks'],
    goal: ['build a startup', 'learn Elixir'],
    skill: ['TypeScript', 'React', 'machine learning'],
    organization: ['NYU', 'OpenAI', 'Stripe'],
  };
  
  const aliases: Record<EntityNodeType, string[]> = {
    person: ['human', 'individual', 'user', 'contact'],
    topic: ['subject', 'theme', 'interest'],
    app: ['application', 'software', 'tool'],
    content: ['media', 'show', 'tv_show', 'movie', 'book', 'video'],
    place: ['location', 'venue', 'site'],
    project: ['repo', 'repository', 'codebase'],
    goal: ['objective', 'aspiration', 'target'],
    skill: ['technology', 'language', 'framework'],
    organization: ['company', 'school', 'team', 'group', 'org'],
  };
  
  for (const type of baseTypes) {
    definitions[type] = {
      id: type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      description: descriptions[type],
      category: BASE_TYPE_CATEGORIES[type],
      examples: examples[type],
      createdAt: now,
      usageCount: 0,
      aliases: aliases[type],
      isBuiltin: true,
    };
  }
  
  return definitions;
}

// Seed edge types
export function createBaseEdgeDefinitions(): Record<string, EdgeTypeDefinition> {
  const now = Date.now();
  
  return {
    knows: {
      id: 'knows',
      label: 'Knows',
      description: 'Has a relationship or acquaintance with',
      directionality: 'bidirectional',
      examples: ['Chris knows Benjamin'],
      createdAt: now,
      usageCount: 0,
      aliases: ['connected_to', 'friends_with'],
    },
    discussed: {
      id: 'discussed',
      label: 'Discussed',
      description: 'Talked about or mentioned in conversation',
      directionality: 'directed',
      examples: ['Benjamin discussed The Bear'],
      createdAt: now,
      usageCount: 0,
      aliases: ['mentioned', 'talked_about', 'brought_up'],
    },
    works_on: {
      id: 'works_on',
      label: 'Works On',
      description: 'Actively building or contributing to',
      directionality: 'directed',
      examples: ['Chris works on nyu-swipes'],
      createdAt: now,
      usageCount: 0,
      aliases: ['builds', 'develops', 'contributes_to', 'working_on'],
    },
    attended: {
      id: 'attended',
      label: 'Attended',
      description: 'Was present at an event',
      directionality: 'directed',
      examples: ['Benjamin attended poker game'],
      createdAt: now,
      usageCount: 0,
      aliases: ['participated_in', 'went_to', 'joined'],
    },
    recommended: {
      id: 'recommended',
      label: 'Recommended',
      description: 'Suggested to another person',
      directionality: 'directed',
      inverseType: 'recommended_by',
      examples: ['yangyang recommended The Bear'],
      createdAt: now,
      usageCount: 0,
      aliases: ['suggested', 'endorsed'],
    },
    interested_in: {
      id: 'interested_in',
      label: 'Interested In',
      description: 'Has a clear interest in',
      directionality: 'directed',
      examples: ['Chris interested in AI'],
      createdAt: now,
      usageCount: 0,
      aliases: ['likes', 'into', 'passionate_about'],
    },
    collaborating_with: {
      id: 'collaborating_with',
      label: 'Collaborating With',
      description: 'Working together on something',
      directionality: 'bidirectional',
      examples: ['Chris collaborating with Benjamin'],
      createdAt: now,
      usageCount: 0,
      aliases: ['working_with', 'partnered_with'],
    },
    related_to: {
      id: 'related_to',
      label: 'Related To',
      description: 'Has some connection (use when relationship is unclear)',
      directionality: 'bidirectional',
      examples: ['basketball related to The Bear'],
      createdAt: now,
      usageCount: 0,
      aliases: ['associated_with', 'connected_to'],
    },
  };
}

/**
 * Normalize a type name to canonical form
 */
export function normalizeTypeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Check if two type names are similar (for deduplication)
 */
export function areTypesSimilar(a: string, b: string): boolean {
  const normA = normalizeTypeName(a);
  const normB = normalizeTypeName(b);
  
  if (normA === normB) return true;
  
  // Check common variations
  const variations = [
    [normA, normB],
    [normA + 's', normB],
    [normA, normB + 's'],
    [normA.replace(/_/g, ''), normB.replace(/_/g, '')],
  ];
  
  for (const [v1, v2] of variations) {
    if (v1 === v2) return true;
  }
  
  return levenshteinRatio(normA, normB) > 0.85;
}

function levenshteinRatio(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return (maxLen - distance) / maxLen;
}
