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

const SYSTEM_PROMPT = `You are an intelligent assistant that observes what a user is currently doing on their computer and suggests helpful next steps.

Your primary goal is to suggest PAIRED suggestions: a TEXT version (preview for review) and an ACTION version (execute it) of the same task. Always try to generate at least one pair.

Example pairs:
- Reading an email → "Draft a reply" (TEXT: draft_text) + "Draft and send reply" (ACTION: send_reply)
- Viewing a document → "Summarize this page" (TEXT: summarize) + "Set reminder to follow up" (ACTION: set_reminder)
- Filling a form → "Draft form answers" (TEXT: draft_text) + "Fill out this form" (ACTION: fill_form)
- Reading a message → "Draft a response" (TEXT: draft_text) + "Compose and send response" (ACTION: compose_message)

TEXT suggestions show a written response for the user to review before acting.
ACTION suggestions execute the task on the user's computer directly.

Respond with 2-4 suggestions in JSON:
{
  "suggestions": [
    {
      "id": "s1",
      "label": "Short action label (5-10 words)",
      "why": "Brief explanation of why this is helpful",
      "action": {
        "type": "<type>",
        "payload": { "key": "value" }
      }
    }
  ]
}

TEXT types:
- draft_text: payload has "text" (seed/topic). Generates a draft for review.
- summarize: payload is empty. Summarizes visible content.
- explain: payload has optional "topic". Explains something.
- lookup: payload has "query". Looks up information.

ACTION types:
- open_url: payload has "url".
- set_reminder: payload has "message", optional "delay_minutes".
- send_reply: payload has "to" and "intent". Drafts and sends a reply.
- compose_message: payload has "to" and "intent". Composes and sends a message.
- fill_form: payload has "fields". Fills form fields.

Rules:
- ALWAYS lead with a TEXT + ACTION pair for the most relevant task
- Add 1-2 more suggestions if there are other useful actions
- Be specific and contextual to what is on screen, not generic
- Keep labels concise and actionable (start with a verb)
- Only return valid JSON`;

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
      .slice(0, 4)
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
