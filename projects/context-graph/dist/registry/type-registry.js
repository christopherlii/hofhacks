/**
 * Type Registry
 *
 * Manages dynamic node and edge types:
 * - Loads/saves type definitions from JSON
 * - Registers new types proposed by LLM
 * - Consolidates similar types
 * - Provides type lookup and validation
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { SEED_NODE_TYPES, SEED_EDGE_TYPES, normalizeTypeName, areTypesSimilar } from '../types/dynamic-types.js';
export class TypeRegistryManager {
    registry;
    registryPath;
    client;
    dirty = false;
    constructor(registryPath, apiKey) {
        this.registryPath = registryPath;
        this.client = new Anthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY
        });
        this.registry = this.loadOrCreate();
    }
    /**
     * Load existing registry or create with seed types
     */
    loadOrCreate() {
        if (existsSync(this.registryPath)) {
            try {
                const data = JSON.parse(readFileSync(this.registryPath, 'utf-8'));
                console.log(`📚 Loaded type registry: ${Object.keys(data.nodeTypes).length} node types, ${Object.keys(data.edgeTypes).length} edge types`);
                return {
                    ...data,
                    lastUpdated: new Date(data.lastUpdated)
                };
            }
            catch (e) {
                console.warn('⚠️  Failed to load registry, creating new one');
            }
        }
        // Create new registry with seed types
        const nodeTypes = {};
        const edgeTypes = {};
        for (const type of SEED_NODE_TYPES) {
            nodeTypes[type.id] = type;
        }
        for (const type of SEED_EDGE_TYPES) {
            edgeTypes[type.id] = type;
        }
        const registry = {
            version: '1.0.0',
            lastUpdated: new Date(),
            nodeTypes,
            edgeTypes
        };
        this.saveRegistry(registry);
        console.log('📚 Created new type registry with seed types');
        return registry;
    }
    /**
     * Save registry to disk
     */
    saveRegistry(registry) {
        const toSave = registry || this.registry;
        toSave.lastUpdated = new Date();
        writeFileSync(this.registryPath, JSON.stringify(toSave, null, 2));
    }
    /**
     * Get all known node type IDs
     */
    getNodeTypeIds() {
        return Object.keys(this.registry.nodeTypes);
    }
    /**
     * Get all known edge type IDs
     */
    getEdgeTypeIds() {
        return Object.keys(this.registry.edgeTypes);
    }
    /**
     * Get type definition by ID (checks aliases too)
     */
    getNodeType(typeId) {
        const normalized = normalizeTypeName(typeId);
        // Direct lookup
        if (this.registry.nodeTypes[normalized]) {
            return this.registry.nodeTypes[normalized];
        }
        // Check aliases
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
    getEdgeType(typeId) {
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
     * Returns the ID if found, or proposes registration if new
     */
    resolveOrPropose(typeName, isEdgeType = false) {
        const normalized = normalizeTypeName(typeName);
        const getter = isEdgeType ? this.getEdgeType.bind(this) : this.getNodeType.bind(this);
        const types = isEdgeType ? this.registry.edgeTypes : this.registry.nodeTypes;
        // Check exact match
        const existing = getter(normalized);
        if (existing) {
            return { id: existing.id, isNew: false, existingType: existing };
        }
        // Check similarity with existing types
        for (const type of Object.values(types)) {
            if (areTypesSimilar(normalized, type.id)) {
                return { id: type.id, isNew: false, existingType: type };
            }
            for (const alias of type.aliases) {
                if (areTypesSimilar(normalized, alias)) {
                    return { id: type.id, isNew: false, existingType: type };
                }
            }
        }
        // It's new
        return { id: normalized, isNew: true };
    }
    /**
     * Register a new type (called when LLM proposes one)
     */
    registerNodeType(proposal) {
        const normalized = normalizeTypeName(proposal.id);
        // Check for existing
        const existing = this.getNodeType(normalized);
        if (existing) {
            existing.usageCount++;
            this.dirty = true;
            return existing;
        }
        const newType = {
            id: normalized,
            label: proposal.label,
            description: proposal.description,
            category: proposal.category,
            examples: proposal.examples || [],
            createdAt: new Date(),
            usageCount: 1,
            aliases: [],
            parentType: proposal.parentType
        };
        this.registry.nodeTypes[normalized] = newType;
        this.dirty = true;
        console.log(`✨ Registered new node type: ${normalized} (${proposal.category})`);
        return newType;
    }
    /**
     * Register a new edge type
     */
    registerEdgeType(proposal) {
        const normalized = normalizeTypeName(proposal.id);
        const existing = this.getEdgeType(normalized);
        if (existing) {
            existing.usageCount++;
            this.dirty = true;
            return existing;
        }
        const newType = {
            id: normalized,
            label: proposal.label,
            description: proposal.description,
            category: 'relational',
            directionality: proposal.directionality || 'directed',
            examples: proposal.examples || [],
            createdAt: new Date(),
            usageCount: 1,
            aliases: [],
            inverseType: proposal.inverseType
        };
        this.registry.edgeTypes[normalized] = newType;
        this.dirty = true;
        console.log(`✨ Registered new edge type: ${normalized}`);
        return newType;
    }
    /**
     * Increment usage count for a type
     */
    recordUsage(typeId, isEdgeType = false) {
        const types = isEdgeType ? this.registry.edgeTypes : this.registry.nodeTypes;
        const normalized = normalizeTypeName(typeId);
        if (types[normalized]) {
            types[normalized].usageCount++;
            this.dirty = true;
        }
    }
    /**
     * Use LLM to consolidate similar types
     */
    async consolidateTypes() {
        const nodeTypes = Object.values(this.registry.nodeTypes);
        const edgeTypes = Object.values(this.registry.edgeTypes);
        if (nodeTypes.length < 2 && edgeTypes.length < 2) {
            return { mergedNodeTypes: [], mergedEdgeTypes: [] };
        }
        const prompt = `You are a knowledge graph schema optimizer. Given these type definitions, identify any that should be merged because they represent the same concept.

NODE TYPES:
${nodeTypes.map(t => `- ${t.id}: ${t.description} (aliases: ${t.aliases.join(', ') || 'none'})`).join('\n')}

EDGE TYPES:
${edgeTypes.map(t => `- ${t.id}: ${t.description} (aliases: ${t.aliases.join(', ') || 'none'})`).join('\n')}

For each merge, pick the most general/canonical name as the target.
Output JSON:
{
  "nodeTypeMerges": [
    { "merge": ["type_a", "type_b"], "into": "canonical_type", "reason": "..." }
  ],
  "edgeTypeMerges": [
    { "merge": ["type_x", "type_y"], "into": "canonical_type", "reason": "..." }
  ]
}

If no merges needed, return empty arrays.`;
        const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        });
        const content = response.content[0];
        if (content.type !== 'text') {
            return { mergedNodeTypes: [], mergedEdgeTypes: [] };
        }
        let jsonStr = content.text;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch)
            jsonStr = jsonMatch[1];
        const parsed = JSON.parse(jsonStr.trim());
        const mergedNodeTypes = [];
        const mergedEdgeTypes = [];
        // Apply node type merges
        for (const merge of parsed.nodeTypeMerges || []) {
            const targetId = normalizeTypeName(merge.into);
            const target = this.registry.nodeTypes[targetId];
            if (!target)
                continue;
            for (const sourceId of merge.merge) {
                const normalized = normalizeTypeName(sourceId);
                if (normalized === targetId)
                    continue;
                const source = this.registry.nodeTypes[normalized];
                if (!source)
                    continue;
                // Merge source into target
                target.aliases = [...new Set([...target.aliases, normalized, ...source.aliases])];
                target.examples = [...new Set([...target.examples, ...source.examples])].slice(0, 10);
                target.usageCount += source.usageCount;
                // Remove source
                delete this.registry.nodeTypes[normalized];
                console.log(`🔀 Merged node type '${normalized}' into '${targetId}'`);
            }
            mergedNodeTypes.push({ from: merge.merge, to: targetId });
        }
        // Apply edge type merges
        for (const merge of parsed.edgeTypeMerges || []) {
            const targetId = normalizeTypeName(merge.into);
            const target = this.registry.edgeTypes[targetId];
            if (!target)
                continue;
            for (const sourceId of merge.merge) {
                const normalized = normalizeTypeName(sourceId);
                if (normalized === targetId)
                    continue;
                const source = this.registry.edgeTypes[normalized];
                if (!source)
                    continue;
                target.aliases = [...new Set([...target.aliases, normalized, ...source.aliases])];
                target.examples = [...new Set([...target.examples, ...source.examples])].slice(0, 10);
                target.usageCount += source.usageCount;
                delete this.registry.edgeTypes[normalized];
                console.log(`🔀 Merged edge type '${normalized}' into '${targetId}'`);
            }
            mergedEdgeTypes.push({ from: merge.merge, to: targetId });
        }
        if (mergedNodeTypes.length > 0 || mergedEdgeTypes.length > 0) {
            this.dirty = true;
        }
        return { mergedNodeTypes, mergedEdgeTypes };
    }
    /**
     * Generate a summary for the extraction prompt
     */
    getTypeSummaryForPrompt() {
        const nodeTypes = Object.values(this.registry.nodeTypes)
            .sort((a, b) => b.usageCount - a.usageCount)
            .slice(0, 20);
        const edgeTypes = Object.values(this.registry.edgeTypes)
            .sort((a, b) => b.usageCount - a.usageCount)
            .slice(0, 15);
        return `KNOWN NODE TYPES (use these when applicable, or propose new ones):
${nodeTypes.map(t => `- ${t.id}: ${t.description}`).join('\n')}

KNOWN EDGE TYPES:
${edgeTypes.map(t => `- ${t.id}: ${t.description}`).join('\n')}

You may propose NEW types if none of the above fit. Include:
- id: lowercase_with_underscores
- label: Human Readable Name
- description: What this type represents
- category: entity|concept|activity|artifact|attribute|temporal`;
    }
    /**
     * Save if dirty
     */
    persist() {
        if (this.dirty) {
            this.saveRegistry();
            this.dirty = false;
            console.log('💾 Saved type registry');
        }
    }
    /**
     * Get stats
     */
    getStats() {
        const nodeTypes = Object.values(this.registry.nodeTypes);
        const edgeTypes = Object.values(this.registry.edgeTypes);
        return {
            nodeTypeCount: nodeTypes.length,
            edgeTypeCount: edgeTypes.length,
            topNodeTypes: nodeTypes
                .sort((a, b) => b.usageCount - a.usageCount)
                .slice(0, 5)
                .map(t => ({ id: t.id, usageCount: t.usageCount })),
            topEdgeTypes: edgeTypes
                .sort((a, b) => b.usageCount - a.usageCount)
                .slice(0, 5)
                .map(t => ({ id: t.id, usageCount: t.usageCount })),
            recentlyAdded: [...nodeTypes, ...edgeTypes]
                .filter(t => Date.now() - new Date(t.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000)
                .map(t => t.id)
        };
    }
}
