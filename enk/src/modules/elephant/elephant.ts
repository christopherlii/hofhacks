import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

import type { NiaClient, NiaContext } from '../../nia-client';
import { claudeTextRequest } from '../../shared/claude-http';
import { logElephantEvent } from './logger';
import { generateSuggestions, type Suggestion, type SuggestionAction, type Actor, type ActorResult } from './suggestions';
import type { NowContext } from '../../types';
import { OpenClawClient } from '../../openclaw-client';

const ACTION_TYPES = new Set(['open_url', 'set_reminder', 'send_reply', 'compose_message', 'fill_form']);

const TEXT_ACTOR_PROMPT = `You are a helpful assistant embedded in a desktop productivity tool. The user clicked a suggestion and you need to generate a useful text response.

You will receive:
- The suggestion they selected (label + reason)
- Their current screen context (app, window title, URL, visible text)

Generate a concise, directly useful response. For example:
- If the suggestion is to draft a reply, write the draft
- If it's to summarize something, write the summary
- If it's to explain something, provide the explanation

Be specific and actionable. Write the output the user needs, not a description of what you'd do.`;

const TASK_LABEL_PROMPT = `In one sentence, what task is this person working on? Reply with only the sentence.`;

async function labelTask(apiKey: string, contextText: string): Promise<string | null> {
  if (!apiKey || !contextText.trim()) return null;

  const text = await claudeTextRequest(apiKey, {
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    system: TASK_LABEL_PROMPT,
    messages: [{ role: 'user', content: contextText }]
  });

  return text ? text.trim() : null;
}

interface ElephantInitOptions {
  apiKey: () => string;
  nia: NiaClient;
  getContext: () => NowContext;
  captureContext: () => Promise<NowContext>;
  actor?: Actor;
}

interface ActiveSession {
  correlationId: string;
  context: NowContext;
  suggestions: Suggestion[];
  actionTaken: boolean;
}

function buildTextActorMessage(action: SuggestionAction, context: NowContext): string {
  const parts: string[] = [];
  parts.push(`## Suggestion Selected`);
  parts.push(`Action: ${action.type}`);
  if (action.payload.text) parts.push(`Detail: ${action.payload.text}`);
  if (action.payload.message) parts.push(`Detail: ${action.payload.message}`);

  parts.push(`\n## Current Context`);
  if (context.activeApp) parts.push(`App: ${context.activeApp}`);
  if (context.windowTitle) parts.push(`Window: ${context.windowTitle}`);
  if (context.url) parts.push(`URL: ${context.url}`);
  if (context.visibleText) parts.push(`Visible text:\n${context.visibleText.slice(0, 2000)}`);

  return parts.join('\n');
}

async function textActor(action: SuggestionAction, context: NowContext): Promise<ActorResult> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, type: 'text', message: 'No API key configured.' };

  const text = await claudeTextRequest(apiKey, {
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    system: TEXT_ACTOR_PROMPT,
    messages: [{ role: 'user', content: buildTextActorMessage(action, context) }],
  });

  if (!text) return { ok: false, type: 'text', message: 'Failed to generate response.' };

  return { ok: true, type: 'text', message: 'Response generated.', text };
}

// OpenClaw client for browser-controlled actions
const openClawClient = new OpenClawClient({
  host: '127.0.0.1',
  port: 18789,
  token: '',
});

function setOpenClawToken(token: string): void {
  openClawClient.setToken(token);
}

function buildActionPrompt(action: SuggestionAction, context: NowContext): string {
  const actionDetails = Object.entries(action.payload)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  // For email/message actions, instruct to use browser control
  if (action.type === 'send_reply' || action.type === 'compose_message') {
    return `You have browser control via the Browser Relay extension.

ACTION: ${action.type}
${actionDetails}

INSTRUCTIONS:
1. Use browser snapshot to read the full email/message thread currently visible
2. Understand the context and what response is appropriate
3. Draft a professional, contextual reply based on what you read
4. Type the reply into the compose field
5. Send it

Current app: ${context.activeApp || 'Unknown'}
Window: ${context.windowTitle || 'Unknown'}
${context.url ? `URL: ${context.url}` : ''}

Execute this now using browser control. Read the actual content on screen, draft an appropriate reply, and send it.`;
  }

  // For other actions, simpler prompt
  return `Execute this action using your available tools:

Action: ${action.type}
${actionDetails}

Context:
- App: ${context.activeApp || 'Unknown'}
- Window: ${context.windowTitle || 'Unknown'}
${context.url ? `- URL: ${context.url}` : ''}

Execute this now.`;
}

async function actionActor(action: SuggestionAction, context: NowContext): Promise<ActorResult> {
  const prompt = buildActionPrompt(action, context);

  try {
    const response = await openClawClient.ask(prompt);
    return { ok: true, type: 'action', message: response };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Enk] OpenClaw failed:', errMsg);
    return { ok: false, type: 'action', message: errMsg };
  }
}

const defaultActor: Actor = async (action, context) => {
  if (ACTION_TYPES.has(action.type)) {
    return actionActor(action, context);
  }
  return textActor(action, context);
};

let elephantWindow: BrowserWindow | null = null;
let getApiKey: () => string = () => '';
let niaClient: NiaClient;
let getContext: () => NowContext;
let captureContext: () => Promise<NowContext>;
let actor: Actor = defaultActor;
let activeSession: ActiveSession | null = null;

function createCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function init(opts: ElephantInitOptions): void {
  getApiKey = opts.apiKey;
  niaClient = opts.nia;
  getContext = opts.getContext;
  captureContext = opts.captureContext;
  actor = opts.actor ?? defaultActor;
}

function extractEntities(context: NowContext): string[] {
  const entities = new Set<string>();
  const text = [context.windowTitle, context.url, context.visibleText || ''].join(' ');

  const tickets = text.match(/\b[A-Z]{2,10}-\d{1,6}\b/g);
  if (tickets) tickets.forEach((t) => entities.add(t));

  const urls = text.match(/https?:\/\/[^\s"'<>]+/g);
  if (urls) urls.forEach((u) => entities.add(u));

  const filePaths = text.match(/(?:\/[\w.-]+){2,}/g);
  if (filePaths) filePaths.forEach((p) => entities.add(p));

  const skipWords = new Set([
    'The', 'This', 'That', 'With', 'From', 'Your', 'What', 'When',
    'Where', 'How', 'For', 'And', 'But', 'Not', 'Are', 'Was',
    'Has', 'Have', 'Will', 'Can', 'New', 'All', 'Get', 'Set', 'Now'
  ]);
  const capitalized = text.match(/\b[A-Z][a-z]{2,}\b/g);
  if (capitalized) {
    capitalized.filter((w) => !skipWords.has(w)).forEach((w) => entities.add(w));
  }

  return [...entities].slice(0, 20);
}

async function writeToNia(context: NowContext, sessionId: string): Promise<void> {
  const apiKey = getApiKey();
  const entities = extractEntities(context);

  let taskLabel = '';
  if (apiKey) {
    try {
      const labelInput = [context.windowTitle || '', context.url || '', (context.visibleText || '').slice(0, 200)].join(' ').trim();
      taskLabel = (await labelTask(apiKey, labelInput)) || '';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Enk] Task labeling failed:', message);
    }
  }

  try {
    await niaClient.saveContext({
      title: context.windowTitle || context.activeApp || 'Unknown',
      summary: taskLabel,
      content: [
        taskLabel,
        context.windowTitle || '',
        context.url || '',
        (context.visibleText || '').slice(0, 2000)
      ].join('\n').trim(),
      tags: entities.slice(0, 10),
      memoryType: 'episodic',
      agentSource: 'enk-elephant'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Enk] Nia write failed:', message);
  }
}

async function createElephantWindow(): Promise<BrowserWindow> {
  if (elephantWindow && !elephantWindow.isDestroyed()) return elephantWindow;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea;

  const winWidth = 400;
  const winHeight = 500;
  const winX = dx + dw - winWidth - 24;
  const winY = dy + Math.max(24, Math.round((dh - winHeight) / 2));

  elephantWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  elephantWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  elephantWindow.setContentProtection(true);

  elephantWindow.on('closed', () => {
    elephantWindow = null;
  });

  await elephantWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'elephant.html'));

  return elephantWindow;
}

function buildSearchQuery(context: NowContext): string {
  return [
    context.activeApp || '',
    context.windowTitle || '',
    context.url || '',
    (context.visibleText || '').slice(0, 300)
  ].filter(Boolean).join(' ').trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function triggerAnalysis(followUpQuestion?: string): Promise<void> {
  if (!elephantWindow || elephantWindow.isDestroyed()) return;

  elephantWindow.webContents.send('elephant-loading');

  try {
    const apiKey = getApiKey();
    const context = await captureContext();
    const correlationId = createCorrelationId();

    // Flush fresh context to NIA in background
    void writeToNia(context, correlationId);

    let niaResults: NiaContext[] = [];
    try {
      const query = followUpQuestion || buildSearchQuery(context);
      if (query) {
        niaResults = await withTimeout(niaClient.semanticSearch(query, { limit: 10 }), 8000, 'NIA search');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Enk] NIA search failed:', message);
    }

    const suggestions = await withTimeout(generateSuggestions(apiKey, context, niaResults, followUpQuestion), 15000, 'Suggestion generation');

    activeSession = {
      correlationId,
      context,
      suggestions,
      actionTaken: false,
    };

    logElephantEvent('suggestions_generated', correlationId, {
      app: context.activeApp,
      title: context.windowTitle,
      suggestion_count: suggestions.length,
      nia_results_count: niaResults.length,
      suggestions: suggestions.map((s) => ({ id: s.id, label: s.label })),
    });

    if (elephantWindow && !elephantWindow.isDestroyed()) {
      elephantWindow.webContents.send('elephant-response', {
        mode: 'workflow',
        correlation_id: correlationId,
        state_summary: `You're in ${context.activeApp}${context.windowTitle ? ` (${context.windowTitle})` : ''}`,
        now_state: {
          app: context.activeApp,
          confidence: 'medium'
        },
        suggestions,
        context: {
          app: context.activeApp,
          title: context.windowTitle,
          url: context.url,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Enk] triggerAnalysis failed:', message);
    if (elephantWindow && !elephantWindow.isDestroyed()) {
      elephantWindow.webContents.send('elephant-error', message);
    }
  }
}

function toggleElephant(): void {
  if (elephantWindow && !elephantWindow.isDestroyed()) {
    dismissElephant();
  } else {
    void showElephant();
  }
}

async function showElephant(): Promise<void> {
  await createElephantWindow();
  // Keep the current app focused while capturing context so suggestions reflect
  // what the user is actually looking at (e.g., current Gmail thread).
  elephantWindow!.showInactive();
  // triggerAnalysis does its own fresh capture via captureContext
  void triggerAnalysis();
}

function dismissElephant(): void {
  if (activeSession && !activeSession.actionTaken) {
    logElephantEvent('suggestions_dismissed', activeSession.correlationId, {
      app: activeSession.context.activeApp,
    });
    activeSession = null;
  }

  if (elephantWindow && !elephantWindow.isDestroyed()) {
    elephantWindow.destroy();
  }
  elephantWindow = null;
}

function setupIPC(): void {
  ipcMain.on('elephant-dismiss', () => dismissElephant());

  ipcMain.on('elephant-follow-up', (_event, question: string) => {
    void triggerAnalysis(question);
  });

  ipcMain.on('elephant-focus-input', () => {
    if (elephantWindow && !elephantWindow.isDestroyed()) {
      elephantWindow.focus();
    }
  });

  ipcMain.on('elephant-blur-input', () => {
    // Keep window focusable while visible so scrolling and interaction remain reliable.
  });

  ipcMain.on('elephant-feedback', (_event, { itemId, isPositive }: { itemId: string; isPositive: boolean }) => {
    const context = getContext();
    logElephantEvent('feedback', createCorrelationId(), {
      item_id: itemId,
      is_positive: isPositive,
      app: context.activeApp,
      url: context.url
    });
  });

  ipcMain.handle('elephant-run-suggestion', async (_event, suggestionId: string) => {
    if (!activeSession) {
      return { ok: false, type: 'text', message: 'No active session.' };
    }

    const suggestion = activeSession.suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) {
      return { ok: false, type: 'text', message: 'Suggestion no longer available.' };
    }

    logElephantEvent('suggestion_accepted', activeSession.correlationId, {
      suggestion_id: suggestion.id,
      suggestion_label: suggestion.label,
      action_type: suggestion.action.type,
    });

    activeSession.actionTaken = true;

    let result: ActorResult;
    try {
      result = await actor(suggestion.action, activeSession.context);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Enk] Actor failed:', errMsg);
      result = { ok: false, type: 'text', message: errMsg };
    }

    logElephantEvent('suggestion_executed', activeSession.correlationId, {
      suggestion_id: suggestion.id,
      action_type: suggestion.action.type,
      result_type: result.type,
      ok: result.ok,
      message: result.message,
    });

    if (result.type === 'text' && result.text && elephantWindow && !elephantWindow.isDestroyed()) {
      elephantWindow.webContents.send('elephant-text-result', {
        suggestion_id: suggestion.id,
        label: suggestion.label,
        text: result.text,
      });
    }

    try {
      await niaClient.saveContext({
        title: `${result.ok ? 'Accepted' : 'Failed'}: ${suggestion.label}`,
        summary: suggestion.why,
        content: [
          `Suggestion: ${suggestion.label}`,
          `Action: ${suggestion.action.type}`,
          `Result: ${result.message}`,
          `App: ${activeSession.context.activeApp || ''}`,
          `Window: ${activeSession.context.windowTitle || ''}`,
          `URL: ${activeSession.context.url || ''}`,
        ].join('\n').trim(),
        tags: ['elephant-executed', suggestion.action.type],
        memoryType: 'episodic',
        agentSource: 'enk-elephant',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Enk] Failed to save suggestion result to NIA:', errMsg);
    }

    return result;
  });

  ipcMain.handle('elephant-clear-memory', async () => {
    return true;
  });
}

export { init, toggleElephant, dismissElephant, setupIPC, writeToNia, extractEntities, setOpenClawToken };
