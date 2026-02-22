import { captureAllScreens, extractNewContent, OcrEngine, ScreenChangeTracker } from '../../main/monitoring/screen-pipeline';
import { scrubSensitiveData, textSimilarity } from '../../shared/scrub';

import type { ClaudeRequestBody, ClaudeResponse, ContentSnapshot, ScamResult } from '../../types';

interface CreateMonitoringPipelineDeps {
  getStore: () => any;
  getCurrentWindow: () => { app: string; title: string; url: string | null };
  updateStatus: (status: string) => void;
  ocrEngine: OcrEngine;
  screenChangeTracker: ScreenChangeTracker;
  contentSnapshots: ContentSnapshot[];
  pendingSummaries: ContentSnapshot[];
  previousTexts: Record<string, string>;
  extractEntitiesFromActivity: (appName: string, title: string, url: string | null, summary: string | null) => void;
  claudeRequest: (body: ClaudeRequestBody) => Promise<ClaudeResponse | null>;
  analyzeForScam: (scrubbedText: string, base64Screenshot: string, lowConfidence: boolean) => Promise<ScamResult | null>;
  showScamAlert: (data: ScamResult) => void;
  dismissAlert: () => void;
}

function createMonitoringPipeline(deps: CreateMonitoringPipelineDeps) {
  let isAnalyzing = false;
  let activeThreat = false;

  async function generateSummaries(): Promise<void> {
    if (deps.pendingSummaries.length === 0) return;
    if (!deps.getStore()?.get('anthropicKey')) return;

    const batch = deps.pendingSummaries.splice(0, 5);
    const entries = batch
      .map((s, i) => {
        return `${i + 1}. App: ${s.app}, Tab: "${s.title}", URL: ${s.url || 'none'}\n   Content: ${s.text
          .slice(0, 200)
          .replace(/\n/g, ' ')}`;
      })
      .join('\n');

    try {
      const data = await deps.claudeRequest({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        system: `Generate a short 5-10 word human-readable summary for each activity entry. Output JSON array of strings.

CRITICAL: ONLY state what you can directly see in the App, Tab, URL, and Content. Do NOT infer message content, email subject, or conversation topic.
- If you only see "Messages - Benjamin Xu", say "Messages with Benjamin Xu" or "opened Messages to Benjamin Xu"-never guess what was discussed.
- For chat apps: describe only that the app was open to that contact. Do not invent the conversation topic.
- Be specific using the content/title when available. Examples: "watched Dave Ramsey budgeting video" (when title shows that), "searched for cafes on Google Maps" (when URL shows maps), "edited main.js in VS Code" (when title shows file).`,
        messages: [{ role: 'user', content: entries }],
      });

      if (!data) return;
      const text = data.content?.[0]?.text;
      if (!text) return;

      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return;

      const summaries: string[] = JSON.parse(match[0]);
      batch.forEach((s, i) => {
        if (summaries[i]) {
          s.summary = summaries[i];
          deps.extractEntitiesFromActivity(s.app, s.title, s.url, summaries[i]);
        }
      });
    } catch (e: any) {
      console.error('[Enk] Summary generation failed:', e.message);
    }
  }

  async function captureLoop(): Promise<void> {
    if (!deps.getStore()?.get('enabled')) {
      deps.updateStatus('inactive');
      return;
    }
    if (isAnalyzing) return;
    isAnalyzing = true;

    try {
      const screens = await captureAllScreens();
      if (screens.length === 0) {
        isAnalyzing = false;
        return;
      }

      const changedScreens = screens.filter((screenCapture) =>
        deps.screenChangeTracker.hasScreenChanged(screenCapture.id, screenCapture.nativeImage)
      );
      if (changedScreens.length === 0) {
        isAnalyzing = false;
        return;
      }

      deps.updateStatus('processing');

      let threatFound = false;
      for (const sc of changedScreens) {
        const pngBuffer = sc.nativeImage.toPNG();
        if (!pngBuffer || pngBuffer.length < 100) {
          console.log(`[Enk] Skipping "${sc.name}" - empty screenshot (screen recording permission needed)`);
          continue;
        }

        console.log(`[Enk] Screenshot captured: "${sc.name}" (${pngBuffer.length} bytes)`);
        const ocr = await deps.ocrEngine.run(pngBuffer);
        const lowConfidence = ocr.confidence < 70;
        const scrubbedText = scrubSensitiveData(ocr.text);
        console.log(
          `[Enk] OCR: confidence=${ocr.confidence.toFixed(1)}%, text=${scrubbedText
            .trim()
            .slice(0, 80)
            .replace(/\n/g, ' ')}...`
        );

        if (!lowConfidence && scrubbedText.trim().length < 20) continue;

        if (scrubbedText.trim().length >= 20) {
          const prevText = deps.previousTexts[sc.id] || '';
          const similarity = textSimilarity(scrubbedText, prevText);

          if (similarity < 0.7) {
            const diffText = extractNewContent(prevText, scrubbedText.trim());
            const win = deps.getCurrentWindow();
            const snapshot: ContentSnapshot = {
              timestamp: Date.now(),
              app: win.app,
              title: win.title,
              url: win.url,
              text: diffText.slice(0, 2000),
              fullText: scrubbedText.trim().slice(0, 500),
              summary: null,
            };
            deps.contentSnapshots.push(snapshot);
            deps.pendingSummaries.push(snapshot);
            deps.previousTexts[sc.id] = scrubbedText;
          }
        }

        if (deps.getStore()?.get('scamDetection') && deps.getStore()?.get('anthropicKey')) {
          const prevScamText = deps.previousTexts[`scam_${sc.id}`];
          const similarity = textSimilarity(scrubbedText, prevScamText);

          if (similarity > 0.85 && activeThreat) {
            threatFound = true;
            continue;
          }
          if (similarity > 0.85) continue;

          deps.previousTexts[`scam_${sc.id}`] = scrubbedText;

          const base64Data = pngBuffer.toString('base64');
          const result = await deps.analyzeForScam(scrubbedText, base64Data, lowConfidence);
          if (result && result.flagged) {
            threatFound = true;
            deps.showScamAlert(result);
          }
        }
      }

      if (threatFound) {
        activeThreat = true;
        deps.updateStatus('threat');
      } else {
        if (activeThreat) deps.dismissAlert();
        activeThreat = false;
        deps.updateStatus('active');
      }
    } catch (err: any) {
      console.error('[Enk] Capture loop error:', err);
      deps.updateStatus('active');
    }

    isAnalyzing = false;
  }

  return { generateSummaries, captureLoop };
}

export { createMonitoringPipeline };
