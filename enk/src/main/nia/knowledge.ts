import type { NiaClient } from '../../nia-client';

interface LoadKnowledgeDeps {
  store: any;
  nia: NiaClient;
}

interface LoadedKnowledge {
  cachedSoul: string;
  cachedUserProfile: string;
  localKnowledge: string;
  knowledgeLastConsolidated: number;
  factCount: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function loadKnowledgeFromNia(deps: LoadKnowledgeDeps): Promise<LoadedKnowledge | null> {
  if (!deps.store?.get('niaKey')) return null;
  deps.nia.setApiKey(deps.store.get('niaKey') as string);

  try {
    const results = await withTimeout(
      Promise.allSettled([
        deps.nia.semanticSearch('soul identity rules', { tags: 'soul', limit: 1 }),
        deps.nia.semanticSearch('user profile preferences', { tags: 'user-profile', limit: 1 }),
        deps.nia.listContexts({ tags: 'user-fact', limit: 50 }),
        deps.nia.listContexts({ tags: 'pattern', limit: 10 }),
      ]),
      10000
    );

    if (!results) {
      console.warn('[Enk] loadKnowledgeFromNia timed out');
      return null;
    }

    let cachedSoul = '';
    let cachedUserProfile = '';
    const factEntries: string[] = [];

    const [soulResult, userResult, factsResult, patternsResult] = results;

    if (soulResult.status === 'fulfilled' && soulResult.value?.length > 0) {
      cachedSoul = soulResult.value[0].content || soulResult.value[0].summary || '';
    }

    if (userResult.status === 'fulfilled' && userResult.value?.length > 0) {
      cachedUserProfile = userResult.value[0].content || userResult.value[0].summary || '';
    }

    if (factsResult.status === 'fulfilled' && factsResult.value?.length > 0) {
      for (const context of factsResult.value) {
        const fact = context.summary || context.content || '';
        if (fact) factEntries.push(`- ${fact}`);
      }
    }

    if (patternsResult.status === 'fulfilled' && patternsResult.value?.length > 0) {
      for (const context of patternsResult.value) {
        const pattern = context.summary || context.content || '';
        if (pattern) factEntries.push(`- [Pattern] ${pattern}`);
      }
    }

    return {
      cachedSoul,
      cachedUserProfile,
      localKnowledge: factEntries.join('\n'),
      knowledgeLastConsolidated: Date.now(),
      factCount: factEntries.length,
    };
  } catch (err: any) {
    console.error('[Enk] Knowledge init failed:', err.message);
    return null;
  }
}

export { loadKnowledgeFromNia };
