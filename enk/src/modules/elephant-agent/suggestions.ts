import { net } from 'electron';

import type { NowState, RetrievedCase, Suggestion, ToolPlan, ToolStep, ToolStepType } from './types';

interface DynamicSuggestionResponse {
  suggestions?: Array<{
    label?: string;
    why?: string;
    preview?: string;
    tool_plan?: {
      summary?: string;
      steps?: Array<{
        type?: string;
        args?: Record<string, unknown>;
      }>;
    };
  }>;
}

function fallbackSuggestion(nowState: NowState): Suggestion[] {
  return [
    {
      id: `${nowState.correlation_id}-fallback`,
      label: 'Summarize current context',
      why: 'Dynamic suggestion generation is unavailable, so using a safe fallback.',
      preview: nowState.subject || nowState.intent || 'No context summary available.',
      tool_plan: {
        id: `${nowState.correlation_id}-fallback-plan`,
        summary: 'No-op fallback action',
        safe_by_default: true,
        steps: [
          {
            type: 'no_op',
            args: { reason: 'dynamic_generation_unavailable' },
            reversible: true,
            verify: false
          }
        ]
      }
    }
  ];
}

function sanitizeArgs(args: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  if (!args) return {};

  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

function isAllowedType(type: string): type is ToolStepType {
  return ['insert_text', 'add_cc', 'open_link', 'create_reminder', 'no_op'].includes(type);
}

function sanitizeStep(rawStep: { type?: string; args?: Record<string, unknown> } | undefined): ToolStep | null {
  if (!rawStep?.type || !isAllowedType(rawStep.type)) return null;

  const type = rawStep.type;
  const args = sanitizeArgs(rawStep.args);

  if (type === 'insert_text' && typeof args.text !== 'string') return null;
  if (type === 'add_cc' && typeof args.email !== 'string') return null;
  if (type === 'open_link' && typeof args.url !== 'string') return null;
  if (type === 'create_reminder') {
    if (typeof args.title !== 'string') return null;
    if (typeof args.days !== 'number') args.days = 3;
  }

  return {
    type,
    args,
    reversible: true,
    verify: type !== 'no_op'
  };
}

function sanitizeSuggestion(nowState: NowState, idx: number, raw: DynamicSuggestionResponse['suggestions'][number]): Suggestion | null {
  if (!raw) return null;

  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const why = typeof raw.why === 'string' ? raw.why.trim() : '';
  const preview = typeof raw.preview === 'string' ? raw.preview.trim() : '';

  if (!label || !why) return null;

  const rawSteps = raw.tool_plan?.steps || [];
  const steps = rawSteps.map((step) => sanitizeStep(step)).filter((step): step is ToolStep => Boolean(step));

  if (steps.length === 0) {
    steps.push({
      type: 'no_op',
      args: { reason: 'empty_dynamic_steps' },
      reversible: true,
      verify: false
    });
  }

  const toolPlan: ToolPlan = {
    id: `${nowState.correlation_id}-dyn-plan-${idx}`,
    summary: raw.tool_plan?.summary || label,
    steps,
    safe_by_default: true
  };

  return {
    id: `${nowState.correlation_id}-dyn-${idx}`,
    label,
    why,
    preview: preview || why,
    tool_plan: toolPlan
  };
}

function createPrompt(nowState: NowState, cases: RetrievedCase[]): string {
  const memory = cases
    .slice(0, 5)
    .map((entry, idx) => {
      const rec = entry.record;
      return `${idx + 1}. score=${entry.score}, suggestion=${rec.suggestion_label}, outcome=${rec.outcome}, intent=${rec.intent}`;
    })
    .join('\n');

  return [
    'You are generating actionable assistant suggestions for a local desktop workflow.',
    'Return strict JSON only.',
    'Constraints:',
    '- Produce 1 to 3 suggestions total.',
    '- Every suggestion must include: label, why, preview, tool_plan.summary, tool_plan.steps[].',
    '- Allowed step types only: insert_text, add_cc, open_link, create_reminder, no_op.',
    '- Never include email send / delete / archive / irreversible actions.',
    '- Keep suggestions concise and practical for the current context.',
    '',
    'Output schema:',
    '{"suggestions":[{"label":"...","why":"...","preview":"...","tool_plan":{"summary":"...","steps":[{"type":"insert_text","args":{"text":"..."}}]}}]}',
    '',
    `NowState: ${JSON.stringify(nowState)}`,
    `SimilarCases: ${memory || 'none'}`
  ].join('\n');
}

function requestDynamicSuggestions(apiKey: string, prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages'
    });

    request.setHeader('Content-Type', 'application/json');
    request.setHeader('x-api-key', apiKey);
    request.setHeader('anthropic-version', '2023-06-01');

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk: Buffer) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          const parsed = JSON.parse(responseData) as {
            error?: unknown;
            content?: Array<{ text?: string }>;
          };

          if (parsed.error) {
            resolve(null);
            return;
          }

          resolve(parsed.content?.[0]?.text || null);
        } catch {
          resolve(null);
        }
      });
    });

    request.on('error', () => resolve(null));

    request.write(
      JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 900,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      })
    );

    request.end();
  });
}

function parseDynamicResponse(nowState: NowState, rawText: string | null): Suggestion[] {
  if (!rawText) return fallbackSuggestion(nowState);

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackSuggestion(nowState);

    const parsed = JSON.parse(jsonMatch[0]) as DynamicSuggestionResponse;
    const suggestions = (parsed.suggestions || [])
      .slice(0, 3)
      .map((item, idx) => sanitizeSuggestion(nowState, idx + 1, item))
      .filter((item): item is Suggestion => Boolean(item));

    if (suggestions.length === 0) return fallbackSuggestion(nowState);
    return suggestions;
  } catch {
    return fallbackSuggestion(nowState);
  }
}

async function generateSuggestions(apiKey: string, nowState: NowState, cases: RetrievedCase[]): Promise<Suggestion[]> {
  if (!apiKey) return fallbackSuggestion(nowState);

  const prompt = createPrompt(nowState, cases);
  const responseText = await requestDynamicSuggestions(apiKey, prompt);
  return parseDynamicResponse(nowState, responseText);
}

export { generateSuggestions };
