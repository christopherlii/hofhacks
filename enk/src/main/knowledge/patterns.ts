import type { NiaClient, NiaContext } from '../../nia-client';
import type { ClaudeRequestBody, ClaudeResponse } from '../../types';

interface PatternDeps {
  store: any;
  nia: NiaClient;
  getLocalKnowledge: () => string;
  appendKnowledge: (facts: string[]) => void;
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
}

class PatternDetector {
  private readonly deps: PatternDeps;
  private lastPatternDate = '';

  constructor(deps: PatternDeps) {
    this.deps = deps;
  }

  async detectPatterns(): Promise<void> {
    if (!this.deps.store.get('anthropicKey') || !this.deps.store.get('niaKey')) return;
    this.deps.nia.setApiKey(this.deps.store.get('niaKey') as string);

    const today = new Date().toISOString().slice(0, 10);
    if (this.lastPatternDate === today) return;

    try {
      const recentLogs = await this.deps.nia.semanticSearch('daily activity log', { tags: 'daily-log', limit: 20 });
      if (!recentLogs || recentLogs.length < 3) return;

      const logsText = recentLogs
        .map((log: NiaContext) => `### ${log.title}\n${(log.content || log.summary || '').slice(0, 800)}`)
        .join('\n\n');

      const existingKnowledge = this.deps.getLocalKnowledge() || '(none yet)';

      const data = await this.deps.claudeRequest({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        system: `You analyze computer activity logs to build a profile of who this person is. Focus on WHAT they care about, not HOW they use their computer.

DO extract:
- Specific content consumed (video titles, articles, topics)
- People they interact with and the nature of those relationships
- Projects they're working on and their current status
- Recurring interests and hobbies (specific: "watches La Liga football" not "watches videos")
- Goals or plans mentioned or implied
- Apps/tools they rely on for specific tasks

DO NOT extract:
- Generic computer behavior ("switches between apps", "uses browser")
- Observations about app switching, tab management, or workflow
- Anything already known (see existing knowledge below)

Output JSON array: [{"insight": "specific fact about this person", "evidence": "brief supporting detail from the logs"}]. Max 8 insights. Only include things you're confident about.

## Already Known
${existingKnowledge}`,
        messages: [{ role: 'user', content: `Analyze these activity logs:\n\n${logsText}` }],
      });

      if (!data) return;
      const text = data.content?.[0]?.text;
      if (!text) return;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;

      const insights: { insight: string; evidence?: string }[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(insights) || insights.length === 0) return;

      const patternContent = insights
        .map((pattern, index) => `${index + 1}. ${pattern.insight}${pattern.evidence ? ` (${pattern.evidence})` : ''}`)
        .join('\n');

      await this.deps.nia.saveContext({
        title: `Profile Insights - ${today}`,
        summary: insights.map((pattern) => pattern.insight).join('; '),
        content: patternContent,
        tags: ['pattern', today],
        memoryType: 'fact',
      });

      this.deps.appendKnowledge(insights.map((pattern) => pattern.insight));
      this.lastPatternDate = today;
      console.log(`[Enk] Extracted ${insights.length} profile insights: ${insights.map((p) => p.insight).join('; ')}`);
    } catch (err: any) {
      console.error('[Enk] Pattern detection failed:', err.message);
    }
  }
}

function createPatternDetector(deps: PatternDeps): PatternDetector {
  return new PatternDetector(deps);
}

export { createPatternDetector, PatternDetector };
