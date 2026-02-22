import { net } from 'electron';

import type { ClaudeRequestBody, ClaudeResponse, ScamResult } from '../types';

const SCAM_SYSTEM_PROMPT =
  'You are a scam detection system analyzing text extracted from a user\'s screen. Determine if anything dangerous is happening. Flag: remote access software (AnyDesk, TeamViewer, UltraViewer), fake support interfaces, gift card/wire/crypto payment requests, urgent virus/account warnings, fake login pages, unusual pop-ups demanding action. Respond in JSON: {"flagged": true/false, "risk_level": "low/medium/high", "reason": "brief explanation"}';

function createClaudeApi(getStore: () => any) {
  function claudeRequest(body: ClaudeRequestBody): Promise<ClaudeResponse | null> {
    return new Promise((resolve) => {
      const apiKey = getStore()?.get('anthropicKey') as string;
      if (!apiKey) {
        resolve(null);
        return;
      }

      const request = net.request({ method: 'POST', url: 'https://api.anthropic.com/v1/messages' });
      request.setHeader('Content-Type', 'application/json');
      request.setHeader('x-api-key', apiKey);
      request.setHeader('anthropic-version', '2023-06-01');

      let responseData = '';
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });
        response.on('end', () => {
          try {
            const data = JSON.parse(responseData);
            if (data.error) {
              console.error('[Enk] Claude error:', data.error);
              resolve(null);
              return;
            }
            resolve(data);
          } catch (e: any) {
            console.error('[Enk] Claude parse error:', e.message);
            resolve(null);
          }
        });
      });

      request.on('error', (err: Error) => {
        console.error('[Enk] Claude request error:', err.message);
        resolve(null);
      });

      request.write(JSON.stringify(body));
      request.end();
    });
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
