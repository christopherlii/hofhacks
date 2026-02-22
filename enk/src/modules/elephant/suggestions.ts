import { claudeTextRequest } from '../../shared/claude-http';
import type { NiaContext } from '../../nia-client';
import type { NowContext } from '../../types';

export interface SuggestionAction {
  type: string;
  payload: Record<string, string>;
}

export interface Suggestion {
  id: string;
  label: string;
  why: string;
  action: SuggestionAction;
}

export interface ActorResult {
  ok: boolean;
  type: 'text' | 'action';
  message: string;
  text?: string;
}

export type Actor = (action: SuggestionAction, context: NowContext) => Promise<ActorResult>;

const SYSTEM_PROMPT = `You are an intelligent assistant that observes what a user is currently doing on their computer and suggests helpful next actions.

You will receive:
1. The user's current context (active app, window title, URL, visible text)
2. Relevant past activity from their memory

Based on this, suggest 1-3 brief, actionable next steps. Each suggestion should be something the user can immediately act on.

Respond in JSON format:
{
  "suggestions": [
    {
      "id": "s1",
      "label": "Short action label (5-10 words)",
      "why": "Brief explanation of why this is helpful",
      "action": {
        "type": "open_url | draft_text | set_reminder | notify | no_op",
        "payload": { "key": "value" }
      }
    }
  ]
}

Action types:
- open_url: payload has "url". Opens a link.
- draft_text: payload has "text". Prepares text for the user.
- set_reminder: payload has "message" and optional "delay_minutes".
- notify: payload has "message". Shows a notification.
- no_op: payload is empty. Informational suggestion only.

Rules:
- Be specific and contextual, not generic
- Suggestions should relate to what the user is actively doing
- If you don't have enough context, return fewer suggestions
- Keep labels concise and actionable (start with a verb)
- Pick the most appropriate action type for each suggestion
- Only return valid JSON, nothing else`;

function buildUserMessage(context: NowContext, niaResults: NiaContext[], followUpQuestion?: string): string {
  const parts: string[] = [];

  parts.push('## Current Context');
  if (context.activeApp) parts.push(`App: ${context.activeApp}`);
  if (context.windowTitle) parts.push(`Window: ${context.windowTitle}`);
  if (context.url) parts.push(`URL: ${context.url}`);
  if (context.visibleText) {
    parts.push(`Visible text:\n${context.visibleText.slice(0, 1500)}`);
  }

  if (niaResults.length > 0) {
    parts.push('\n## Relevant Past Activity');
    for (const result of niaResults.slice(0, 5)) {
      const line = [result.title, result.summary, result.content?.slice(0, 200)].filter(Boolean).join(' — ');
      if (line) parts.push(`- ${line}`);
    }
  }

  if (followUpQuestion) {
    parts.push(`\n## User Question\n${followUpQuestion}`);
  }

  return parts.join('\n');
}

export async function generateSuggestions(
  apiKey: string,
  context: NowContext,
  niaResults: NiaContext[],
  followUpQuestion?: string
): Promise<Suggestion[]> {
  if (!apiKey) return [];

  try {
    const userMessage = buildUserMessage(context, niaResults, followUpQuestion);

    const text = await claudeTextRequest(apiKey, {
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }, { role: 'assistant', content: '{' }],
    });

    if (!text) return [];

    const parsed = JSON.parse('{' + text);
    const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    return raw
      .filter((s: any) => s.id && s.label && s.why)
      .slice(0, 3)
      .map((s: any) => ({
        id: String(s.id),
        label: String(s.label),
        why: String(s.why),
        action: {
          type: String(s.action?.type || 'no_op'),
          payload: (s.action?.payload && typeof s.action.payload === 'object') ? s.action.payload : {},
        },
      }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Enk] Suggestion generation failed:', message);
    return [];
  }
}
