import { claudeHttpRequest } from '../shared/claude-http';

import type { ClaudeRequestBody, ClaudeResponse, ScamResult } from '../types';

const SCAM_SYSTEM_PROMPT =
  'You are a scam detection system analyzing text extracted from a user\'s screen. Determine if anything dangerous is happening. Flag: remote access software (AnyDesk, TeamViewer, UltraViewer), fake support interfaces, gift card/wire/crypto payment requests, urgent virus/account warnings, fake login pages, unusual pop-ups demanding action. Respond in JSON: {"flagged": true/false, "risk_level": "low/medium/high", "reason": "brief explanation"}';

function createClaudeApi(getStore: () => any) {
  function claudeRequest(body: ClaudeRequestBody): Promise<ClaudeResponse | null> {
    const apiKey = getStore()?.get('anthropicKey') as string;
    if (!apiKey) return Promise.resolve(null);
    return claudeHttpRequest(apiKey, body as unknown as Record<string, unknown>) as Promise<ClaudeResponse | null>;
  }

  async function analyzeForScam(
    scrubbedText: string,
    base64Screenshot: string,
    lowConfidence: boolean
  ): Promise<ScamResult | null> {
    const content: any[] = [];

    if (lowConfidence && base64Screenshot) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Screenshot } });
      content.push({
        type: 'text',
        text: 'Analyze this screenshot for scams. OCR was low confidence. Extracted text: ' + (scrubbedText || '(none)'),
      });
    } else {
      content.push({ type: 'text', text: 'Analyze for scams or dangerous activity:\n\n' + scrubbedText });
    }

    const data = await claudeRequest({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: SCAM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    if (!data) return null;
    const text = data.content?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  }

  return { claudeRequest, analyzeForScam };
}

export { createClaudeApi };
