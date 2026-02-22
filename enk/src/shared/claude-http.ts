import { net } from 'electron';

export interface ClaudeRawResponse {
  error?: unknown;
  content?: Array<{ text?: string }>;
}

/**
 * Single low-level HTTP request to the Anthropic Messages API.
 * Every caller that needs Claude goes through this one function.
 */
export function claudeHttpRequest(
  apiKey: string,
  body: Record<string, unknown>
): Promise<ClaudeRawResponse | null> {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
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
          const data = JSON.parse(responseData) as ClaudeRawResponse;
          if (data.error) {
            console.error('[Enk] Claude API error:', data.error);
            resolve(null);
            return;
          }
          resolve(data);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error('[Enk] Claude parse error:', message);
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

/** Convenience: call Claude and return just the text of the first content block. */
export async function claudeTextRequest(
  apiKey: string,
  body: Record<string, unknown>
): Promise<string | null> {
  const data = await claudeHttpRequest(apiKey, body);
  return data?.content?.[0]?.text ?? null;
}
