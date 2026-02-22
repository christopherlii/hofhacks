/**
 * Vision API client for screen context extraction
 * 
 * Supports GPT-4o-mini (OpenAI) and Gemini 2.0 Flash for understanding what 
 * the user is actively doing, with spatial awareness (ignores sidebars, etc.)
 */

interface OpenAIResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message: string;
  };
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  error?: {
    message: string;
    code: number;
  };
}

export interface VisionResult {
  task: string;           // What the user is doing
  app: string;            // Active application
  intent: string;         // creating, researching, communicating, consuming
  people: string[];       // People involved (names, handles)
  topics: string[];       // Topics/subjects
  projects: string[];     // Project names if visible
  confidence: 'low' | 'medium' | 'high';
  raw: string;            // Raw model response
}

const VISION_PROMPT = `Analyze this screenshot and describe what the user is ACTIVELY focused on.

IMPORTANT:
- Focus on the MAIN content area only
- IGNORE sidebars, message previews, notifications, dock/taskbar
- IGNORE background windows
- Be specific about names, topics, and what they're doing

Respond in JSON format:
{
  "task": "Brief description of current task (e.g., 'Writing email to Sarah about Q3 planning')",
  "app": "Application name",
  "intent": "creating|researching|communicating|consuming|navigating",
  "people": ["Names or handles of people involved in the ACTIVE content"],
  "topics": ["Specific topics/subjects being worked on"],
  "projects": ["Project names if visible"],
  "confidence": "low|medium|high"
}

Only include people/topics that are in the MAIN focused content, not sidebar previews.`;

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Rate limiting
let lastVisionCall = 0;
const MIN_INTERVAL_MS = 10000; // Max 1 call per 10 seconds

/**
 * Extract context using OpenAI GPT-4o-mini
 */
async function extractWithOpenAI(
  screenshotBase64: string,
  apiKey: string
): Promise<VisionResult | null> {
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${screenshotBase64}`,
                  detail: 'low', // Use low detail to reduce tokens/cost
                },
              },
              {
                type: 'text',
                text: VISION_PROMPT,
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Vision] OpenAI API error:', response.status, errorText);
      return null;
    }

    const data: OpenAIResponse = await response.json();

    if (data.error) {
      console.error('[Vision] OpenAI error:', data.error.message);
      return null;
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      console.error('[Vision] No response text from OpenAI');
      return null;
    }

    return parseVisionResponse(text);
  } catch (err) {
    console.error('[Vision] Error calling OpenAI:', err);
    return null;
  }
}

/**
 * Extract context using Gemini 2.0 Flash
 */
async function extractWithGemini(
  screenshotBase64: string,
  apiKey: string
): Promise<VisionResult | null> {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'image/png',
                data: screenshotBase64,
              },
            },
            {
              text: VISION_PROMPT,
            },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Vision] Gemini API error:', response.status, errorText);
      return null;
    }

    const data: GeminiResponse = await response.json();

    if (data.error) {
      console.error('[Vision] Gemini error:', data.error.message);
      return null;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('[Vision] No response text from Gemini');
      return null;
    }

    return parseVisionResponse(text);
  } catch (err) {
    console.error('[Vision] Error calling Gemini:', err);
    return null;
  }
}

/**
 * Parse the JSON response from either API
 */
function parseVisionResponse(text: string): VisionResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[Vision] Could not parse JSON from response:', text);
    return {
      task: text.slice(0, 200),
      app: 'Unknown',
      intent: 'unknown',
      people: [],
      topics: [],
      projects: [],
      confidence: 'low',
      raw: text,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      task: parsed.task || 'Unknown activity',
      app: parsed.app || 'Unknown',
      intent: parsed.intent || 'unknown',
      people: Array.isArray(parsed.people) ? parsed.people : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      confidence: parsed.confidence || 'medium',
      raw: text,
    };
  } catch (err) {
    console.error('[Vision] JSON parse error:', err);
    return {
      task: text.slice(0, 200),
      app: 'Unknown',
      intent: 'unknown',
      people: [],
      topics: [],
      projects: [],
      confidence: 'low',
      raw: text,
    };
  }
}

/**
 * Main entry point - uses OpenAI if key starts with sk-, otherwise Gemini
 */
export async function extractVisionContext(
  screenshotBase64: string,
  apiKey: string
): Promise<VisionResult | null> {
  if (!apiKey) {
    console.log('[Vision] No vision API key configured');
    return null;
  }

  // Rate limiting
  const now = Date.now();
  if (now - lastVisionCall < MIN_INTERVAL_MS) {
    console.log('[Vision] Rate limited, skipping');
    return null;
  }
  lastVisionCall = now;

  // Detect which API to use based on key format
  if (apiKey.startsWith('sk-')) {
    console.log('[Vision] Using OpenAI GPT-4o-mini');
    return extractWithOpenAI(screenshotBase64, apiKey);
  } else {
    console.log('[Vision] Using Gemini 2.0 Flash');
    return extractWithGemini(screenshotBase64, apiKey);
  }
}

/**
 * Resize image for vision API (reduces tokens/cost)
 * Target: ~1000px on longest edge
 */
export function resizeForVision(pngBuffer: Buffer): Promise<Buffer> {
  // Use sharp if available, otherwise return original
  try {
    const sharp = require('sharp');
    return sharp(pngBuffer)
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 80 })
      .toBuffer();
  } catch {
    // sharp not available, return original
    return Promise.resolve(pngBuffer);
  }
}

/**
 * Check if we should run vision based on context
 */
export function shouldRunVision(
  lastVisionResult: VisionResult | null,
  currentApp: string,
  screenChanged: boolean,
  timeSinceLastVision: number
): boolean {
  // Always run if no previous result
  if (!lastVisionResult) return true;
  
  // Run if app changed
  if (lastVisionResult.app.toLowerCase() !== currentApp.toLowerCase()) return true;
  
  // Run if screen changed significantly and enough time passed
  if (screenChanged && timeSinceLastVision > 15000) return true;
  
  // Run periodically even without changes (max every 60s)
  if (timeSinceLastVision > 60000) return true;
  
  return false;
}
