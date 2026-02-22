import { execSync } from 'child_process';
import type { NowContext } from '../../types';
import { executeJavaScriptInFrontBrowser, isBrowserWithScriptSupport } from './browser-dom';
import type { NowState } from './types';

interface GmailDomSnapshot {
  mode: 'reading' | 'reply' | 'compose' | 'unknown';
  sender: string | null;
  senderEmail: string | null;
  subject: string | null;
  snippet: string | null;
  url: string | null;
}

function isGmailContext(context: NowContext): boolean {
  const url = context.url || '';
  const title = context.windowTitle || '';
  return url.includes('mail.google.com') || /\bGmail\b/i.test(title);
}

interface ActiveAppInfo {
  app: string | null;
  title: string | null;
  url: string | null;
}

function getLiveActiveAppInfo(): ActiveAppInfo {
  if (process.platform !== 'darwin') {
    return { app: null, title: null, url: null };
  }

  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        set windowTitle to ""
        try
          set windowTitle to name of front window of (first application process whose frontmost is true)
        end try
      end tell
      return frontApp & "|||" & windowTitle
    `;
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 600,
      encoding: 'utf8'
    }).trim();

    const [app, title] = result.split('|||');
    let url: string | null = null;

    if (['Safari', 'Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Arc'].includes(app || '')) {
      try {
        const urlScript =
          app === 'Safari'
            ? 'tell application "Safari" to return URL of front document'
            : `tell application "${app}" to return URL of active tab of front window`;

        url = execSync(`osascript -e '${urlScript.replace(/'/g, "'\\''")}'`, {
          timeout: 600,
          encoding: 'utf8'
        }).trim();
      } catch {
        // Best effort only.
      }
    }

    return {
      app: app || null,
      title: title || null,
      url: url || null
    };
  } catch {
    return { app: null, title: null, url: null };
  }
}

function parseSenderDomain(senderEmail: string | null): string | null {
  if (!senderEmail || !senderEmail.includes('@')) return null;
  return senderEmail.split('@')[1].toLowerCase();
}

function inferMode(context: NowContext, snippet: string | null): NowState['mode'] {
  if (isGmailContext(context)) {
    if (/\bcompose\b/i.test(context.windowTitle || '')) return 'compose';
    if (/\bre:\b/i.test(context.windowTitle || '')) return 'reply';
    return 'reading';
  }

  const text = `${context.windowTitle || ''} ${snippet || ''}`.toLowerCase();
  if (text.includes('edit') || text.includes('draft') || text.includes('compose')) return 'editing';
  if (text.includes('review') || text.includes('pull request')) return 'reviewing';
  return 'unknown';
}

function inferIntent(context: NowContext, mode: NowState['mode'], subject: string | null, snippet: string | null): string {
  const haystack = `${context.activeApp || ''} ${subject || ''} ${snippet || ''}`.toLowerCase();

  if (isGmailContext(context)) {
    if (mode === 'compose') return 'compose_response';
    if (mode === 'reply') return 'reply_thread';
    if (haystack.includes('invoice') || haystack.includes('payment') || haystack.includes('billing')) return 'finance_followup';
    if (haystack.includes('meeting') || haystack.includes('calendar') || haystack.includes('schedule')) return 'meeting_coordination';
    if (haystack.includes('review') || haystack.includes('approve') || haystack.includes('approval')) return 'approval_request';
    return 'email_triage';
  }

  if (haystack.includes('pull request') || haystack.includes('code review')) return 'code_review';
  if (haystack.includes('bug') || haystack.includes('incident') || haystack.includes('error')) return 'bug_triage';
  if (haystack.includes('meeting') || haystack.includes('calendar')) return 'meeting_coordination';
  if (haystack.includes('document') || haystack.includes('notion') || haystack.includes('spec')) return 'doc_work';
  return 'general_context';
}

function inferEntities(subject: string | null, snippet: string | null, senderEmail: string | null): string[] {
  const text = `${subject || ''} ${snippet || ''}`;
  const entities = new Set<string>();

  const ticketMatches = text.match(/\b[A-Z]{2,10}-\d{1,6}\b/g) || [];
  ticketMatches.forEach((match) => entities.add(match));

  const emailMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  emailMatches.forEach((match) => entities.add(match.toLowerCase()));

  const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
  urlMatches.forEach((match) => entities.add(match));

  if (senderEmail) entities.add(senderEmail.toLowerCase());

  return [...entities].slice(0, 10);
}

function inferConfidence(subject: string | null, snippet: string | null, url: string | null, sender: string | null): 'low' | 'medium' | 'high' {
  const score = [subject, snippet, url, sender].filter((value) => Boolean(value && String(value).trim())).length;
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function parseGmailDomSnapshot(raw: string | null): GmailDomSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GmailDomSnapshot>;
    const mode = parsed.mode;
    return {
      mode: mode === 'reading' || mode === 'reply' || mode === 'compose' ? mode : 'unknown',
      sender: parsed.sender || null,
      senderEmail: parsed.senderEmail || null,
      subject: parsed.subject || null,
      snippet: parsed.snippet || null,
      url: parsed.url || null
    };
  } catch {
    return null;
  }
}

function tryExtractGmailDom(context: NowContext): GmailDomSnapshot | null {
  if (!isGmailContext(context) || !isBrowserWithScriptSupport(context.activeApp)) return null;

  const script = `(() => {
    const visible = (el) => !!el && el.offsetParent !== null;
    const active = document.activeElement;

    const composeEditorSelectors = [
      'div[aria-label="Message Body"][contenteditable="true"]',
      'div[g_editable="true"][contenteditable="true"]'
    ];

    const editors = composeEditorSelectors
      .map((selector) => Array.from(document.querySelectorAll(selector)))
      .flat()
      .filter((el) => visible(el));

    let mode = 'reading';
    if (editors.length > 0) mode = 'compose';
    if (active && active.getAttribute && active.getAttribute('contenteditable') === 'true') {
      mode = 'reply';
    }

    const senderEl = document.querySelector('span.gD[email], span[email][name], span[email]');
    const sender = senderEl ? (senderEl.getAttribute('name') || senderEl.textContent || null) : null;
    const senderEmail = senderEl ? (senderEl.getAttribute('email') || null) : null;

    const subjectEl = document.querySelector('h2.hP, input[name="subjectbox"], input[aria-label*="Subject"]');
    let subject = null;
    if (subjectEl) {
      subject = subjectEl.value || subjectEl.textContent || null;
    }

    const snippetEl = document.querySelector('div.a3s.aiL, div.a3s');
    const snippet = snippetEl ? (snippetEl.innerText || '').trim().slice(0, 260) : null;

    return JSON.stringify({ mode, sender, senderEmail, subject, snippet, url: location.href });
  })();`;

  const execution = executeJavaScriptInFrontBrowser(context.activeApp, script);
  if (!execution.ok) return null;
  return parseGmailDomSnapshot(execution.output);
}

function buildGenericSnippet(context: NowContext, ocrFallbackEnabled: boolean): string | null {
  if (!ocrFallbackEnabled || !context.visibleText) return null;

  return (
    context.visibleText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 40) || null
  );
}

function extractSubject(context: NowContext): string | null {
  if (!context.windowTitle) return null;
  const title = context.windowTitle.trim();
  if (!title) return null;

  if (isGmailContext(context)) {
    return title.replace(/\s*-\s*Gmail\s*$/i, '').trim() || null;
  }

  return title.slice(0, 140);
}

async function buildNowState(context: NowContext, correlationId: string, ocrFallbackEnabled: boolean): Promise<NowState> {
  const live = getLiveActiveAppInfo();
  const effectiveContext: NowContext = {
    ...context,
    activeApp: live.app || context.activeApp,
    windowTitle: live.title || context.windowTitle,
    url: live.url || context.url
  };

  const gmailSnapshot = tryExtractGmailDom(effectiveContext);

  const sender = gmailSnapshot?.sender || null;
  const senderEmail = gmailSnapshot?.senderEmail || null;
  const subject = gmailSnapshot?.subject || extractSubject(effectiveContext);
  const snippet = gmailSnapshot?.snippet || buildGenericSnippet(effectiveContext, ocrFallbackEnabled);
  const url = gmailSnapshot?.url || effectiveContext.url || null;
  const mode = gmailSnapshot?.mode || inferMode(effectiveContext, snippet);

  return {
    correlation_id: correlationId,
    timestamp: Date.now(),
    app: effectiveContext.activeApp || 'Unknown',
    url,
    mode,
    sender,
    sender_domain: parseSenderDomain(senderEmail),
    subject,
    snippet,
    intent: inferIntent(effectiveContext, mode, subject, snippet),
    entities: inferEntities(subject, snippet, senderEmail),
    recent_actions: [],
    ui_targets: isGmailContext(effectiveContext) ? ['gmail_compose_body', 'gmail_cc_field'] : ['active_window'],
    confidence: inferConfidence(subject, snippet, url, sender)
  };
}

export { buildNowState, isGmailContext };
