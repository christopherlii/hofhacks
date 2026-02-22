/**
 * Claude-powered entity and relationship extraction
 *
 * Uses Claude to intelligently parse text and extract:
 * - Entities (people, projects, skills, beliefs, etc.)
 * - Relationships between entities
 * - Behavioral patterns
 * - Implicit information
 */
import Anthropic from '@anthropic-ai/sdk';
import { generateId } from '../utils/ids.js';
const EXTRACTION_PROMPT = `You are an expert at building knowledge graphs about people. 
Given text about a person, extract structured information.

CRITICAL: Be specific. Don't generalize. Extract what's actually stated or strongly implied.

Output format (JSON):
{
  "nodes": [
    {
      "type": "<node_type>",
      "label": "<concise label>",
      "attributes": { <key-value pairs with details> },
      "confidence": <0-1>,
      "salience": <0-1, how central to understanding this person>
    }
  ],
  "edges": [
    {
      "type": "<edge_type>",
      "sourceLabel": "<label of source node>",
      "targetLabel": "<label of target node>",
      "weight": <0-1>,
      "confidence": <0-1>,
      "evidence": "<quote or paraphrase from text>"
    }
  ],
  "rawInsights": ["<insight not captured as node/edge>", ...]
}

Node types: identity, trait, skill, interest, belief, goal, project, person, organization, behavior, preference, event, location, resource, pattern, emotion, context

Edge types: is, has, wants, does, knows, uses, attends, created, believes, prefers, avoids, triggers, correlates, contradicts, depends_on, leads_to, part_of

IMPORTANT:
- Extract implicit information (if they're building an NYU project, they likely attend NYU)
- Note behavioral patterns (communication style, work patterns)
- Capture values and beliefs even if not explicitly stated
- High salience = defining characteristic, low = incidental detail
- Be conservative with confidence - only high if explicitly stated`;
export class ClaudeExtractor {
    client;
    model;
    totalTokensUsed = 0;
    estimatedCost = 0;
    constructor(apiKey, model = 'claude-sonnet-4-20250514') {
        this.client = new Anthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY
        });
        this.model = model;
    }
    async extract(text, sourceInfo, existingContext) {
        const contextPrompt = existingContext
            ? `\n\nEXISTING KNOWLEDGE (avoid duplicating, focus on new info):\n${existingContext}`
            : '';
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            messages: [
                {
                    role: 'user',
                    content: `${EXTRACTION_PROMPT}${contextPrompt}\n\nTEXT TO ANALYZE:\n${text}`
                }
            ]
        });
        // Track usage
        this.totalTokensUsed += (response.usage.input_tokens + response.usage.output_tokens);
        // Sonnet pricing: $3/1M input, $15/1M output
        this.estimatedCost += (response.usage.input_tokens * 0.000003) + (response.usage.output_tokens * 0.000015);
        const content = response.content[0];
        if (content.type !== 'text') {
            throw new Error('Unexpected response type');
        }
        // Parse JSON from response (handle markdown code blocks)
        let jsonStr = content.text;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }
        const parsed = JSON.parse(jsonStr.trim());
        const timestamp = new Date();
        const source = { ...sourceInfo, timestamp };
        // Convert to our node/edge format
        const nodes = parsed.nodes.map((n) => ({
            id: generateId(n.type, n.label),
            type: n.type,
            label: n.label,
            attributes: n.attributes || {},
            confidence: n.confidence || 0.5,
            sources: [source],
            firstSeen: timestamp,
            lastUpdated: timestamp,
            salience: n.salience || 0.5
        }));
        const edges = parsed.edges.map((e) => {
            const sourceNode = nodes.find(n => n.label === e.sourceLabel);
            const targetNode = nodes.find(n => n.label === e.targetLabel);
            return {
                id: generateId('edge', `${e.sourceLabel}-${e.type}-${e.targetLabel}`),
                type: e.type,
                source: sourceNode?.id || generateId('unknown', e.sourceLabel),
                target: targetNode?.id || generateId('unknown', e.targetLabel),
                weight: e.weight || 0.5,
                confidence: e.confidence || 0.5,
                evidence: [e.evidence],
                sources: [source]
            };
        });
        return {
            nodes,
            edges,
            rawInsights: parsed.rawInsights || [],
            confidence: this.calculateOverallConfidence(nodes, edges)
        };
    }
    calculateOverallConfidence(nodes, edges) {
        if (nodes.length === 0)
            return 0;
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
