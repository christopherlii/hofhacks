import { execFileSync } from 'child_process';
import { shell } from 'electron';

import { executeJavaScriptInFrontBrowser } from './elephant-agent/browser-dom';
import type { NowState, ToolExecutionResult, ToolPlan, ToolStep } from './elephant-agent/types';

function parseJsonOutput(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function invalidResult(message: string): ToolExecutionResult {
  return {
    ok: false,
    message,
    verification_ok: false
  };
}

function executeInsertText(nowState: NowState, text: string): ToolExecutionResult {
  const script = `(() => {
    const text = ${JSON.stringify(text)};
    const active = document.activeElement;

    const appendText = (el) => {
      const before = (el.value || el.innerText || '').trim();
      const prefix = before.length > 0 ? '\\n\\n' : '';
      const payload = prefix + text;

      if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text')) {
        const prevValue = el.value || '';
        el.focus();
        el.value = prevValue + payload;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        const after = el.value || '';
        return { beforeLength: prevValue.length, afterLength: after.length, inserted: after.includes(text.slice(0, Math.min(24, text.length))) };
      }

      if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
        el.focus();
        try {
          document.execCommand('insertText', false, payload);
        } catch (_) {
          el.innerText = (el.innerText || '') + payload;
        }
        const after = el.innerText || '';
        return { beforeLength: before.length, afterLength: after.length, inserted: after.includes(text.slice(0, Math.min(24, text.length))) };
      }

      return null;
    };

    const candidates = [
      active,
      ...Array.from(document.querySelectorAll('div[aria-label=\"Message Body\"][contenteditable=\"true\"], div[g_editable=\"true\"][contenteditable=\"true\"], textarea, input[type=\"text\"], div[contenteditable=\"true\"]'))
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (!candidate || candidate.offsetParent === null) continue;
      const result = appendText(candidate);
      if (result && result.inserted) {
        return JSON.stringify({
          ok: true,
          verification_ok: true,
          before_length: result.beforeLength,
          after_length: result.afterLength,
          message: 'Text inserted into focused editable target.'
        });
      }
    }

    return JSON.stringify({ ok: false, verification_ok: false, message: 'No editable target found for insert_text.' });
  })();`;

  const execResult = executeJavaScriptInFrontBrowser(nowState.app, script);
  if (!execResult.ok) {
    return invalidResult(execResult.error || 'Failed to execute insert_text action.');
  }

  const parsed = parseJsonOutput(execResult.output);
  if (!parsed) {
    return invalidResult('Action result was not parseable.');
  }

  return {
    ok: Boolean(parsed.ok),
    message: String(parsed.message || 'insert_text complete'),
    verification_ok: Boolean(parsed.verification_ok),
    details: parsed
  };
}

function executeAddCc(nowState: NowState, email: string): ToolExecutionResult {
  if (!nowState.url || !nowState.url.includes('mail.google.com')) {
    return invalidResult('Add CC is only supported for Gmail contexts.');
  }

  const script = `(() => {
    const findCcInput = () => {
      const selectors = [
        'input[aria-label="Cc recipients"]',
        'input[aria-label*="Cc"]',
        'input[name="cc"]'
      ];
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input) return input;
      }
      return null;
    };

    let ccInput = findCcInput();
    if (!ccInput) {
      const toggles = Array.from(document.querySelectorAll('span, div, button')).filter((el) => (el.textContent || '').trim() === 'Cc');
      if (toggles.length > 0) {
        toggles[0].click();
        ccInput = findCcInput();
      }
    }

    if (!ccInput) {
      return JSON.stringify({ ok: false, verification_ok: false, message: 'Unable to locate Gmail CC field.' });
    }

    ccInput.focus();
    const email = ${JSON.stringify(email)};
    const existing = (ccInput.value || '').trim();
    if (!existing.toLowerCase().includes(email.toLowerCase())) {
      ccInput.value = existing ? existing + ', ' + email : email;
      ccInput.dispatchEvent(new Event('input', { bubbles: true }));
      ccInput.dispatchEvent(new Event('change', { bubbles: true }));
      ccInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }

    const chipText = document.body.innerText || '';
    const verified = (ccInput.value || '').toLowerCase().includes(email.toLowerCase()) || chipText.toLowerCase().includes(email.toLowerCase());

    return JSON.stringify({
      ok: verified,
      verification_ok: verified,
      message: verified ? 'CC recipient added.' : 'Unable to verify CC recipient.',
      cc_value: ccInput.value || ''
    });
  })();`;

  const execResult = executeJavaScriptInFrontBrowser(nowState.app, script);
  if (!execResult.ok) {
    return invalidResult(execResult.error || 'Failed to execute Gmail add_cc action.');
  }

  const parsed = parseJsonOutput(execResult.output);
  if (!parsed) {
    return invalidResult('Action result was not parseable.');
  }

  return {
    ok: Boolean(parsed.ok),
    message: String(parsed.message || 'add_cc complete'),
    verification_ok: Boolean(parsed.verification_ok),
    details: parsed
  };
}

function executeOpenLink(url: string): ToolExecutionResult {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return invalidResult('open_link only supports http/https URLs.');
  }

  void shell.openExternal(url);
  return {
    ok: true,
    message: `Opened ${url}`,
    verification_ok: true
  };
}

function executeCreateReminder(title: string, days: number): ToolExecutionResult {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(30, Math.round(days)) : 3;

  const script = `
    tell application "Reminders"
      set dueDate to (current date) + (${safeDays} * days)
      tell list "Reminders"
        make new reminder with properties {name:${JSON.stringify(title)}, due date:dueDate}
      end tell
    end tell
  `;

  try {
    execFileSync('osascript', ['-e', script], {
      encoding: 'utf8',
      timeout: 1500
    });

    return {
      ok: true,
      message: `Reminder created for ${safeDays} day(s) from now.`,
      verification_ok: true
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return invalidResult(`Failed to create reminder: ${message}`);
  }
}

function executeStep(nowState: NowState, step: ToolStep): ToolExecutionResult {
  switch (step.type) {
    case 'insert_text':
      return executeInsertText(nowState, String(step.args.text || ''));
    case 'add_cc':
      return executeAddCc(nowState, String(step.args.email || ''));
    case 'open_link':
      return executeOpenLink(String(step.args.url || ''));
    case 'create_reminder':
      return executeCreateReminder(String(step.args.title || 'Follow up'), Number(step.args.days || 3));
    case 'no_op':
      return {
        ok: true,
        message: String(step.args.reason || 'No-op suggestion selected.'),
        verification_ok: true
      };
    default:
      return invalidResult(`Unsupported tool step: ${String(step.type)}`);
  }
}

async function executeToolPlan(nowState: NowState, plan: ToolPlan): Promise<ToolExecutionResult> {
  for (const step of plan.steps) {
    const result = executeStep(nowState, step);
    if (!result.ok) return result;
  }

  return {
    ok: true,
    message: `Executed ${plan.steps.length} step(s): ${plan.summary}`,
    verification_ok: true
  };
}

export { executeToolPlan };
