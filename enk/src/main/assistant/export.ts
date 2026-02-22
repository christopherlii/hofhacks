import type { NiaClient } from '../../nia-client';

interface ExportDeps {
  store: any;
  nia: NiaClient;
  defaultSoul: string;
  defaultUser: string;
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function exportMarkdown(
  deps: ExportDeps,
  type: string,
  date?: string
): Promise<{ content?: string; filename?: string; error?: string }> {
  if (!deps.store.get('niaKey')) return { error: 'Nia API key not set.' };
  deps.nia.setApiKey(deps.store.get('niaKey') as string);

  try {
    if (type === 'soul') {
      const results = await deps.nia.semanticSearch('soul identity', { tags: 'soul', limit: 1 });
      return { content: results?.[0]?.content || deps.defaultSoul, filename: 'soul.md' };
    }

    if (type === 'user') {
      const results = await deps.nia.semanticSearch('user profile', { tags: 'user-profile', limit: 1 });
      return { content: results?.[0]?.content || deps.defaultUser, filename: 'user.md' };
    }

    if (type === 'daily') {
      const targetDate = date || formatDate(Date.now());
      const results = await deps.nia.semanticSearch(`activity log ${targetDate}`, { tags: `daily-log,${targetDate}`, limit: 24 });
      if (!results || results.length === 0) {
        return { content: `# No activity data for ${targetDate}`, filename: `${targetDate}.md` };
      }
      const combined = results.map((result) => result.content || result.summary || '').join('\n\n---\n\n');
      return { content: `# Activity Summary - ${targetDate}\n\n${combined}`, filename: `${targetDate}.md` };
    }

    if (type === 'patterns') {
      const results = await deps.nia.semanticSearch('recurring patterns', { tags: 'pattern', limit: 10 });
      if (!results || results.length === 0) {
        return { content: '# No patterns detected yet', filename: 'patterns.md' };
      }
      const combined = results.map((result) => `## ${result.title}\n${result.content || result.summary || ''}`).join('\n\n');
      return { content: `# Detected Patterns\n\n${combined}`, filename: 'patterns.md' };
    }

    return { error: 'Unknown export type' };
  } catch (err: any) {
    return { error: err.message };
  }
}

export { exportMarkdown };
