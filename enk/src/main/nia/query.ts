import type { NiaClient } from '../../nia-client';

async function searchNiaContexts(store: any, nia: NiaClient, query: string): Promise<any[]> {
  if (!store.get('niaKey')) return [];
  nia.setApiKey(store.get('niaKey') as string);
  try {
    return await nia.semanticSearch(query, { limit: 20 });
  } catch {
    return [];
  }
}

async function listNiaContexts(store: any, nia: NiaClient, opts?: { tags?: string; limit?: number }): Promise<any[]> {
  if (!store.get('niaKey')) return [];
  nia.setApiKey(store.get('niaKey') as string);
  try {
    return await nia.listContexts({ tags: opts?.tags, limit: opts?.limit || 50 });
  } catch {
    return [];
  }
}

export { listNiaContexts, searchNiaContexts };
