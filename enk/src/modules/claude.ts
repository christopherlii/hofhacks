import { net } from 'electron';
import type { GuardianResult, NiaQueryResult, NowContext } from '../types';

const GUARDIAN_SYSTEM_PROMPT = `You are a scam detection system analyzing text extracted from a user's screen. Determine if anything dangerous is happening. Flag the following: remote access software open (AnyDesk, TeamViewer, UltraViewer), fake Microsoft/Apple/IRS/Social Security support interfaces, anyone asking for gift cards, wire transfers, or cryptocurrency as payment, urgent language about viruses or account suspension, fake login pages or phishing sites, unusual pop-ups demanding immediate action. Respond in JSON: {"flagged": true/false, "risk_level": "low/medium/high", "reason": "brief plain English explanation"}`;

const ELEPHANT_SYSTEM_PROMPT = `You are Enk Elephant — a personal memory and context assistant embedded in the user's desktop. You never forget anything the user has worked on.

Your job when invoked:
1. Tell the user exactly what they were doing and where they left off
2. Surface the most relevant things from their past work that connect to right now
3. Suggest the most logical next step based on context and history
4. If they seem to be returning after a break, orient them immediately

You have access to:
- What is currently on their screen (NowContext)
- Ranked memory results from past sessions (Nia results)

Respond in this exact JSON format:
{
  "summary": "1 sentence — what the user is doing right now",
  "orientation": "1-2 sentences — if returning from a break, orient them: what they were working on, where they left off. Null if they haven't been away.",
  "relevant_memory": [
    {"text": "specific memory item", "source": "app or context it came from", "ago": "how long ago"},
    {"text": "specific memory item", "source": "app or context it came from", "ago": "how long ago"},
    {"text": "specific memory item", "source": "app or context it came from", "ago": "how long ago"}
  ],
  "next_steps": [
    "concrete specific actionable suggestion",
    "concrete specific actionable suggestion",
    "concrete specific actionable suggestion"
  ],
  "ask_back": "one short clarifying question only if genuinely needed, otherwise null",
  "confidence": "low|medium|high"
}

Rules:
- Be specific. Use actual file names, URLs, project names from the context.
- Never be generic. "Continue working" is not a next step.
- If confidence is low, set next_steps to [] and use ask_back.
- Never surface anything that was scrubbed as PII.
- The orientation field is the most important field when the user has been away for more than 30 minutes.`;

const TASK_LABEL_PROMPT = `In one sentence, what task is this person working on? Reply with only the sentence.`;

function claudeRequest(apiKey: string, body: Record<string, unknown>): Promise<string | null> {
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
          const data = JSON.parse(responseData) as {
            error?: unknown;
            content?: Array<{ text?: string }>;
          };
          if (data.error) {
            console.error('[Enk] API error:', data.error);
            resolve(null);
            return;
          }
          const text = data.content?.[0]?.text;
          resolve(text ?? null);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error('[Enk] Failed to parse response:', message);
          resolve(null);
        }
      });
    });

    request.on('error', (err: Error) => {
      console.error('[Enk] Request error:', err.message);
      resolve(null);
    });

    request.write(JSON.stringify(body));
    request.end();
  });
}

async function analyzeWithClaude(
  apiKey: string,
  scrubbedText: string,
  base64Screenshot: string,
  lowConfidence: boolean
): Promise<GuardianResult | null> {
  if (!apiKey) return null;

  const content: Array<Record<string, unknown>> = [];

  if (lowConfidence && base64Screenshot) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: base64Screenshot }
    });
    content.push({
      type: 'text',
      text:
        'Analyze this screenshot for scams or dangerous situations. OCR was low confidence, so please read the screen directly. Any text we could extract: ' +
        (scrubbedText || '(none)')
    });
  } else {
    content.push({
      type: 'text',
      text: "Analyze the following text extracted from a user's screen for scams or dangerous activity:\n\n" + scrubbedText
    });
  }

  const text = await claudeRequest(apiKey, {
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    system: GUARDIAN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }]
  });

  if (!text) return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as GuardianResult;
    } catch {
      return null;
    }
  }
  return null;
}

async function queryElephant(
  apiKey: string,
  nowContext: NowContext,
  niaResults: NiaQueryResult[],
  followUpQuestion?: string
): Promise<string | null> {
  if (!apiKey) return null;

  let userMessage = '';

  userMessage += '## Current Screen (NowContext)\n';
  userMessage += `- **Active App**: ${nowContext.activeApp || 'Unknown'}\n`;
  userMessage += `- **Window Title**: ${nowContext.windowTitle || 'Unknown'}\n`;
  if (nowContext.url) userMessage += `- **URL**: ${nowContext.url}\n`;
  userMessage += `\n### Visible Text (excerpt)\n${(nowContext.visibleText || '').slice(0, 2000)}\n`;

  if (niaResults && niaResults.length > 0) {
    userMessage += '\n## Nia Memory Results (ranked by relevance)\n';
    for (const r of niaResults) {
      const ago = formatAgo(r.timestamp);
      userMessage += `- [${r.app}] (${ago}) ${r.task_label || r.snippet} (relevance: ${r.relevance_score})\n`;
    }
  }

  if (followUpQuestion) {
    userMessage += `\n## User Question\n${followUpQuestion}\n`;
  }

  return claudeRequest(apiKey, {
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: ELEPHANT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  });
}

async function labelTask(apiKey: string, contextText: string): Promise<string | null> {
  if (!apiKey || !contextText.trim()) return null;

  const text = await claudeRequest(apiKey, {
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    system: TASK_LABEL_PROMPT,
    messages: [{ role: 'user', content: contextText }]
  });

  return text ? text.trim() : null;
}

function formatAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export { analyzeWithClaude, queryElephant, labelTask };
