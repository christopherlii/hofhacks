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
  id: string;                    // Canonical ID (lowercase, underscored)
  label: string;                 // Human-readable name
  description: string;           // What this type represents
  category: TypeCategory;        // High-level grouping
  examples: string[];            // Example instances
  createdAt: Date;
  usageCount: number;            // How often it's been used
  aliases: string[];             // Merged types that map here
  parentType?: string;           // For hierarchical types (tv_show -> media)
}

export type TypeCategory = 
  | 'entity'       // People, organizations, places
  | 'concept'      // Ideas, beliefs, values
  | 'activity'     // Actions, events, behaviors
  | 'artifact'     // Projects, creations, resources
  | 'attribute'    // Traits, skills, preferences
  | 'temporal'     // Time-based (events, patterns)
  | 'relational';  // Edge types (connections between entities)

export interface EdgeTypeDefinition extends TypeDefinition {
  category: 'relational';
  directionality: 'directed' | 'bidirectional';
  sourceCategories?: TypeCategory[];   // What can be the source
  targetCategories?: TypeCategory[];   // What can be the target
  inverseType?: string;                // e.g., "recommended_by" is inverse of "recommended"
}

export interface TypeRegistry {
  version: string;
  lastUpdated: Date;
  nodeTypes: Record<string, TypeDefinition>;
  edgeTypes: Record<string, EdgeTypeDefinition>;
}

// Seed types to bootstrap the system
export const SEED_NODE_TYPES: TypeDefinition[] = [
  {
    id: 'person',
    label: 'Person',
    description: 'A human individual',
    category: 'entity',
    examples: ['Chris', 'Benjamin Xu', 'Katie'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['human', 'individual', 'user']
  },
  {
    id: 'project',
    label: 'Project',
    description: 'Something being built or worked on',
    category: 'artifact',
    examples: ['nyu-swipes', 'context-graph', 'hofhacks'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['app', 'application', 'repo']
  },
  {
    id: 'topic',
    label: 'Topic',
    description: 'A subject of discussion or interest',
    category: 'concept',
    examples: ['basketball', 'API integration', 'NFL'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['subject', 'theme']
  },
  {
    id: 'media',
    label: 'Media',
    description: 'TV shows, movies, books, podcasts, etc.',
    category: 'artifact',
    examples: ['The Bear', 'Breaking Bad'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['content', 'show', 'tv_show', 'movie', 'book']
  },
  {
    id: 'event',
    label: 'Event',
    description: 'A specific occurrence or gathering',
    category: 'temporal',
    examples: ['poker game', 'hackathon', 'meeting'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['gathering', 'occurrence']
  },
  {
    id: 'place',
    label: 'Place',
    description: 'A physical or virtual location',
    category: 'entity',
    examples: ['Korean restaurant', 'NYU', 'Discord server'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['location', 'venue']
  },
  {
    id: 'organization',
    label: 'Organization',
    description: 'A company, school, team, or group',
    category: 'entity',
    examples: ['NYU', 'OpenAI', 'Stripe'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['company', 'school', 'team', 'group']
  },
  {
    id: 'goal',
    label: 'Goal',
    description: 'An objective or aspiration',
    category: 'concept',
    examples: ['build a startup', 'learn Elixir'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['objective', 'aspiration', 'target']
  }
];

export const SEED_EDGE_TYPES: EdgeTypeDefinition[] = [
  {
    id: 'knows',
    label: 'Knows',
    description: 'Has a relationship or acquaintance with',
    category: 'relational',
    directionality: 'bidirectional',
    examples: ['Chris knows Benjamin'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['connected_to', 'friends_with']
  },
  {
    id: 'discussed',
    label: 'Discussed',
    description: 'Talked about or mentioned in conversation',
    category: 'relational',
    directionality: 'directed',
    examples: ['Benjamin discussed The Bear'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['mentioned', 'talked_about', 'brought_up']
  },
  {
    id: 'works_on',
    label: 'Works On',
    description: 'Actively building or contributing to',
    category: 'relational',
    directionality: 'directed',
    sourceCategories: ['entity'],
    targetCategories: ['artifact'],
    examples: ['Chris works on nyu-swipes'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['builds', 'develops', 'contributes_to']
  },
  {
    id: 'attended',
    label: 'Attended',
    description: 'Was present at an event',
    category: 'relational',
    directionality: 'directed',
    sourceCategories: ['entity'],
    targetCategories: ['temporal'],
    examples: ['Benjamin attended poker game'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['participated_in', 'went_to', 'joined']
  },
  {
    id: 'recommended',
    label: 'Recommended',
    description: 'Suggested to another person',
    category: 'relational',
    directionality: 'directed',
    inverseType: 'recommended_by',
    examples: ['yangyang recommended The Bear'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['suggested', 'endorsed']
  },
  {
    id: 'part_of',
    label: 'Part Of',
    description: 'Belongs to or is contained within',
    category: 'relational',
    directionality: 'directed',
    inverseType: 'contains',
    examples: ['poker game part of friend group activities'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['belongs_to', 'member_of', 'included_in']
  },
  {
    id: 'related_to',
    label: 'Related To',
    description: 'Has some connection (use when relationship is unclear)',
    category: 'relational',
    directionality: 'bidirectional',
    examples: ['basketball related to The Bear'],
    createdAt: new Date(),
    usageCount: 0,
    aliases: ['associated_with', 'connected_to']
  }
];

/**
 * Normalize a type name to canonical form
 */
export function normalizeTypeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')      // Spaces/hyphens -> underscores
    .replace(/[^a-z0-9_]/g, '')   // Remove special chars
    .replace(/_+/g, '_')          // Collapse multiple underscores
    .replace(/^_|_$/g, '');       // Trim leading/trailing underscores
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
    [normA + 's', normB],          // Singular/plural
    [normA, normB + 's'],
    [normA.replace(/_/g, ''), normB.replace(/_/g, '')],  // Without underscores
  ];
  
  for (const [v1, v2] of variations) {
    if (v1 === v2) return true;
  }
  
  // Check edit distance for near-matches
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
