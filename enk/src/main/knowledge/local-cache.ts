import type { NiaClient } from '../../nia-client';
import type { ClaudeRequestBody, ClaudeResponse } from '../../types';
import { loadKnowledgeFromNia } from '../nia/knowledge';

interface LocalKnowledgeDeps {
  getStore: () => any;
  nia: NiaClient;
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
}

interface LocalKnowledgeSnapshot {
  cachedSoul: string;
  cachedUserProfile: string;
  localKnowledge: string;
  knowledgeLastConsolidated: number;
}

class LocalKnowledgeCache {
  private readonly deps: LocalKnowledgeDeps;

  private cachedSoul = '';
  private cachedUserProfile = '';
  private localKnowledge = '';
  private knowledgeLastConsolidated = 0;

  private consolidationPending = false;

  private readonly CONSOLIDATION_INTERVAL_MS = 30 * 60 * 1000;
  private readonly MAX_KNOWLEDGE_LENGTH = 8000;

  constructor(deps: LocalKnowledgeDeps) {
    this.deps = deps;
  }

  async initFromNia(): Promise<void> {
    const store = this.deps.getStore();
    if (!store) return;

    const loaded = await loadKnowledgeFromNia({ store, nia: this.deps.nia });
    if (!loaded) return;

    this.cachedSoul = loaded.cachedSoul;
    this.cachedUserProfile = loaded.cachedUserProfile;
    this.localKnowledge = loaded.localKnowledge;
    this.knowledgeLastConsolidated = loaded.knowledgeLastConsolidated;

    console.log(
      `[Enk] Local knowledge initialized: soul=${this.cachedSoul.length}ch, user=${this.cachedUserProfile.length}ch, facts=${loaded.factCount}`
    );
  }

  getSnapshot(): LocalKnowledgeSnapshot {
    return {
      cachedSoul: this.cachedSoul,
      cachedUserProfile: this.cachedUserProfile,
      localKnowledge: this.localKnowledge,
      knowledgeLastConsolidated: this.knowledgeLastConsolidated,
    };
  }

  getKnowledge(): string {
    return this.localKnowledge;
  }

  getKnowledgeLastConsolidated(): number {
    return this.knowledgeLastConsolidated;
  }

  appendKnowledge(facts: string[]): void {
    for (const fact of facts) {
      this.localKnowledge += `\n- ${fact}`;
    }

    if (this.localKnowledge.length > this.MAX_KNOWLEDGE_LENGTH) {
      this.scheduleConsolidation();
    }
  }

  maybeConsolidate(): void {
    if (this.localKnowledge.length <= 500) return;
    if (Date.now() - this.knowledgeLastConsolidated <= this.CONSOLIDATION_INTERVAL_MS) return;
    this.consolidate().catch(() => {
      // best effort
    });
  }

  scheduleConsolidation(): void {
    if (this.consolidationPending) return;

    this.consolidationPending = true;
    setTimeout(() => {
      this.consolidate()
        .catch(() => {
          // best effort
        })
        .finally(() => {
          this.consolidationPending = false;
        });
    }, 5000);
  }

  async consolidate(): Promise<void> {
    const store = this.deps.getStore();
    if (!store?.get('anthropicKey') || this.localKnowledge.length < 500) return;

    const data = await this.deps.claudeRequest({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system:
        'You maintain a user knowledge file. Given raw accumulated facts (some may be duplicates or outdated), produce a clean, consolidated version. Group by category (interests, goals, relationships, projects, preferences, habits). Remove duplicates. Merge related facts into richer entries. Keep it concise but specific. Output only the consolidated text, no preamble.',
      messages: [{ role: 'user', content: `Consolidate this knowledge:\n\n${this.localKnowledge}` }],
    });

    if (!data) return;

    const text = data.content?.[0]?.text;
    if (!text || text.length <= 50) return;

    this.localKnowledge = text;
    this.knowledgeLastConsolidated = Date.now();
    console.log(`[Enk] Knowledge consolidated: ${this.localKnowledge.length}ch`);
  }
}

export { LocalKnowledgeCache };
export type { LocalKnowledgeSnapshot };
