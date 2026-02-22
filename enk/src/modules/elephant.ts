import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

import { labelTask } from './claude';
import { saveFeedback } from './memory';
import * as nia from './nia';
import { getCurrentContext } from './nowcontext';
import { executeToolPlan } from './openclaw';
import { composeMemoryBrief } from './elephant-agent/memory-brief';
import { buildNowState } from './elephant-agent/nowstate-builder';
import { logElephantEvent } from './elephant-agent/logger';
import { createStateSignature, writeCaseRecord } from './elephant-agent/nia-case-store';
import { retrieveCases } from './elephant-agent/retrieval';
import { generateSuggestions } from './elephant-agent/suggestions';
import type { CaseRecord, NowState, Suggestion } from './elephant-agent/types';
import type { NiaNode, NowContext } from '../types';

interface ElephantInitOptions {
  apiKey: () => string;
}

interface ActiveSession {
  nowState: NowState;
  suggestions: Suggestion[];
  actionTaken: boolean;
}

let elephantWindow: BrowserWindow | null = null;
let getApiKey: () => string = () => '';
let activeSession: ActiveSession | null = null;

function createCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function init({ apiKey }: ElephantInitOptions): void {
  getApiKey = apiKey;
  nia.init();
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
    'The',
    'This',
    'That',
    'With',
    'From',
    'Your',
    'What',
    'When',
    'Where',
    'How',
    'For',
    'And',
    'But',
    'Not',
    'Are',
    'Was',
    'Has',
    'Have',
    'Will',
    'Can',
    'New',
    'All',
    'Get',
    'Set',
    'Now'
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

  const node: NiaNode = {
    session_id: sessionId,
    timestamp: context.timestamp || Date.now(),
    app: context.activeApp,
    window_title: context.windowTitle,
    url: context.url,
    task_label: taskLabel,
    entities,
    visible_text: context.visibleText,
    raw_context: context
  };

  try {
    await nia.write(node);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Enk] Nia write failed:', message);
  }
}

function createElephantWindow(): BrowserWindow {
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
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  void elephantWindow.loadFile(path.join(__dirname, '..', 'ui', 'elephant.html'));
  elephantWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  elephantWindow.setContentProtection(true);

  elephantWindow.on('closed', () => {
    elephantWindow = null;
  });

  return elephantWindow;
}

function stateSummary(nowState: NowState): string {
  const subject = nowState.subject ? ` on "${nowState.subject}"` : '';
  const sender = nowState.sender ? ` with ${nowState.sender}` : '';
  return `You're in ${nowState.app} (${nowState.mode})${sender}${subject}.`;
}

function buildCaseRecordFromSuggestion(
  nowState: NowState,
  suggestion: Suggestion,
  outcome: CaseRecord['outcome'],
  resultMessage: string,
  verificationOk: boolean,
  editDistanceProxy: number | 'unknown'
): CaseRecord {
  return {
    case_id: `${nowState.correlation_id}-${suggestion.id}`,
    correlation_id: nowState.correlation_id,
    timestamp: Date.now(),
    state_signature: createStateSignature(nowState),
    now_state: nowState,
    intent: nowState.intent,
    suggestion_label: suggestion.label,
    actions_taken: suggestion.tool_plan.steps,
    outcome,
    outcome_meta: {
      message: resultMessage,
      verification_ok: verificationOk,
      edit_distance_proxy: editDistanceProxy,
      source: 'elephant-structured'
    }
  };
}

function buildIgnoredCaseRecord(nowState: NowState): CaseRecord {
  return {
    case_id: `${nowState.correlation_id}-dismissed`,
    correlation_id: nowState.correlation_id,
    timestamp: Date.now(),
    state_signature: createStateSignature(nowState),
    now_state: nowState,
    intent: nowState.intent,
    suggestion_label: 'panel_dismissed',
    actions_taken: [],
    outcome: 'ignored',
    outcome_meta: {
      message: 'Panel dismissed without action.',
      verification_ok: true,
      edit_distance_proxy: 'unknown',
      source: 'elephant-structured'
    }
  };
}

async function triggerStructuredSuggestions(context: NowContext, followUpQuestion?: string): Promise<boolean> {
  const correlationId = createCorrelationId();
  const nowState = await buildNowState(context, correlationId, true);

  if (followUpQuestion) {
    nowState.recent_actions.push(`followup:${followUpQuestion.slice(0, 120)}`);
  }

  const retrieval = await retrieveCases(nowState, 12);
  const memoryBrief = composeMemoryBrief(retrieval.records);
  const suggestions = await generateSuggestions(getApiKey(), nowState, retrieval.records);

  activeSession = {
    nowState,
    suggestions,
    actionTaken: false
  };

  logElephantEvent('structured_now_state', correlationId, {
    now_state: nowState,
    retrieval_metadata: retrieval.metadata,
    suggestions: suggestions.map((suggestion) => ({ id: suggestion.id, label: suggestion.label, why: suggestion.why }))
  });

  if (elephantWindow && !elephantWindow.isDestroyed()) {
    elephantWindow.webContents.send('elephant-response', {
      mode: 'workflow',
      correlation_id: nowState.correlation_id,
      state_summary: stateSummary(nowState),
      now_state: {
        app: nowState.app,
        mode: nowState.mode,
        sender: nowState.sender,
        sender_domain: nowState.sender_domain,
        subject: nowState.subject,
        confidence: nowState.confidence
      },
      memory_brief: memoryBrief.bullets,
      suggestions,
      context: {
        app: context.activeApp,
        title: context.windowTitle,
        url: context.url
      }
    });
  }

  return true;
}

async function triggerAnalysis(followUpQuestion?: string): Promise<void> {
  if (!elephantWindow || elephantWindow.isDestroyed()) return;

  elephantWindow.webContents.send('elephant-loading');
  const context = getCurrentContext();

  await triggerStructuredSuggestions(context, followUpQuestion);
}

function toggleElephant(): void {
  if (elephantWindow && !elephantWindow.isDestroyed() && elephantWindow.isVisible()) {
    dismissElephant();
  } else {
    showElephant();
  }
}

function showElephant(): void {
  createElephantWindow();
  // Keep the current app focused while capturing context so suggestions reflect
  // what the user is actually looking at (e.g., current Gmail thread).
  elephantWindow!.showInactive();
  void triggerAnalysis();
}

function dismissElephant(): void {
  if (activeSession && !activeSession.actionTaken) {
    const ignored = buildIgnoredCaseRecord(activeSession.nowState);
    writeCaseRecord(ignored);
    logElephantEvent('suggestions_dismissed', activeSession.nowState.correlation_id, {
      app: activeSession.nowState.app,
      mode: activeSession.nowState.mode,
      intent: activeSession.nowState.intent
    });
    activeSession = null;
  }

  if (elephantWindow && !elephantWindow.isDestroyed()) {
    elephantWindow.hide();
  }
}

function setupIPC(): void {
  ipcMain.on('elephant-dismiss', () => dismissElephant());

  ipcMain.on('elephant-follow-up', (_event, question: string) => {
    void triggerAnalysis(question);
  });

  ipcMain.handle('elephant-run-suggestion', async (_event, suggestionId: string) => {
    if (!activeSession) {
      return {
        ok: false,
        message: 'No active suggestion session.',
        verification_ok: false
      };
    }

    const suggestion = activeSession.suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) {
      return {
        ok: false,
        message: 'Suggestion no longer available.',
        verification_ok: false
      };
    }

    logElephantEvent('suggestion_clicked', activeSession.nowState.correlation_id, {
      suggestion_id: suggestion.id,
      suggestion_label: suggestion.label
    });

    const actionResult = await executeToolPlan(activeSession.nowState, suggestion.tool_plan);
    activeSession.actionTaken = true;

    const editDistanceProxy =
      typeof actionResult.details?.before_length === 'number' && typeof actionResult.details?.after_length === 'number'
        ? Math.abs(Number(actionResult.details.after_length) - Number(actionResult.details.before_length))
        : 'unknown';

    const outcome = actionResult.ok ? 'accepted' : 'failed';
    const caseRecord = buildCaseRecordFromSuggestion(
      activeSession.nowState,
      suggestion,
      outcome,
      actionResult.message,
      actionResult.verification_ok,
      editDistanceProxy
    );

    writeCaseRecord(caseRecord);

    logElephantEvent('suggestion_executed', activeSession.nowState.correlation_id, {
      suggestion_id: suggestion.id,
      suggestion_label: suggestion.label,
      ok: actionResult.ok,
      verification_ok: actionResult.verification_ok,
      message: actionResult.message
    });

    return actionResult;
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
    const context = getCurrentContext();
    saveFeedback(itemId, 'elephant-response', isPositive, context.activeApp, context.url);
  });

  ipcMain.handle('elephant-clear-memory', async () => {
    nia.clear();
    return true;
  });
}

export { init, toggleElephant, dismissElephant, setupIPC, writeToNia, extractEntities };
