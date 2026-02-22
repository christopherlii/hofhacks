import type { NiaClient, NiaContext } from '../../nia-client';
import type { ActivityEntry, ClaudeRequestBody, ClaudeResponse, ContentSnapshot } from '../../types';

interface ChatDeps {
  store: any;
  nia: NiaClient;
  cachedSoul: string;
  cachedUserProfile: string;
  localKnowledge: string;
  getAllActivity: () => ActivityEntry[];
  getAllSnapshots: () => ContentSnapshot[];
  currentWindow: { app: string; title: string; url: string | null };
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function handleChatQuery(deps: ChatDeps, query: string): Promise<{ response?: string; error?: string }> {
  if (!deps.store.get('anthropicKey')) return { error: 'Anthropic API key not set. Go to Settings.' };

  let niaSection = '';
  if (deps.store.get('niaKey')) {
    deps.nia.setApiKey(deps.store.get('niaKey') as string);
    try {
      const niaResults = await withTimeout(deps.nia.semanticSearch(query, { limit: 5 }), 5000);
      if (niaResults && niaResults.length > 0) {
        niaSection = `\n\n## Relevant Historical Memories (Nia)\n`;
        niaSection += niaResults
          .map(
            (result: NiaContext, index: number) =>
              `${index + 1}. ${result.title}\nSummary: ${result.summary || ''}\nContent: ${(result.content || '').slice(0, 600)}...`
          )
          .join('\n\n');
      }
    } catch {
      // Continue without Nia results.
    }
  }

  const recentActivity = deps.getAllActivity()
    .slice(-30)
    .map((entry) => {
      const summaryPart = entry.summary ? ` | summary: ${entry.summary}` : '';
      return `[${new Date(entry.start).toLocaleTimeString()}-${new Date(entry.end).toLocaleTimeString()}] ${entry.app}: ${entry.title}${
        entry.url ? ` (${entry.url})` : ''
      }${summaryPart}`;
    })
    .join('\n');

  const recentContent = deps.getAllSnapshots()
    .slice(-20)
    .map(
      (snapshot) =>
        `[${new Date(snapshot.timestamp).toLocaleTimeString()}] ${snapshot.app} | ${snapshot.title}\nText: ${(snapshot.summary || snapshot.text || '').slice(0, 400)}`
    )
    .join('\n\n');

  const currentSessionInfo = `\n\n## Current Session Activity (Recent)\n${recentActivity || '(none)'}\n\n## Recent Screen Content (OCR)\n${
    recentContent || '(none)'
  }\n\nCurrent focused app: ${deps.currentWindow.app || 'Unknown'}\nCurrent window title: ${deps.currentWindow.title || 'Unknown'}\nCurrent URL: ${deps.currentWindow.url || 'Unknown'}`;

  const knowledgeSection = deps.localKnowledge ? `\n\n## Learned User Knowledge\n${deps.localKnowledge}` : '';

  const systemPrompt = `${deps.cachedSoul}\n\n---\n## User Profile\n${deps.cachedUserProfile}${knowledgeSection}${niaSection}${currentSessionInfo}\n\n---\nAnswer the user's question using ALL the data above — your knowledge about them, activity timeline, screen content (OCR text), and any historical memories. Be specific: cite times, app names, URLs, contact names, and actual content you can see in the screen captures. If the screen text shows who they were talking to or what they were reading, mention it.`;

  const data = await deps.claudeRequest({
    model: 'claude-haiku-4-5',
    max_tokens: 900,
    system: systemPrompt,
    messages: [{ role: 'user', content: query }],
  });

  if (!data) return { error: 'Failed to get response from Claude.' };
  const text = data.content?.[0]?.text;
  return { response: text || 'No response generated.' };
}

export { handleChatQuery };
