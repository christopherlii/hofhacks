/**
 * Reads the macOS Messages database to list chats and fetch messages.
 * Path: ~/Library/Messages/chat.db
 * Requires Full Disk Access on macOS.
 * Uses sql.js (pure JS/WASM) - no native compilation needed.
 */

import path from 'path';
import { existsSync, readFileSync } from 'fs';

export const MESSAGES_DB_PATH = path.join(process.env.HOME || '', 'Library', 'Messages', 'chat.db');

export interface ChatInfo {
  chatId: number;
  chatIdentifier: string;
  handleId: string;
}

export interface MessageRow {
  rowid: number;
  text: string | null;
  attributedBody?: Uint8Array | null;
  date: number;
  isFromMe: number;
  handleId: string;
}

/**
 * Extract plain text from attributedBody blob (macOS Ventura+).
 * attributedBody is NSArchiver/typedstream; we use a heuristic to find the main UTF-8 string.
 */
function extractTextFromAttributedBody(blob: Uint8Array | Buffer | null | undefined): string | null {
  if (!blob || blob.length < 4) return null;
  const arr = blob instanceof Buffer ? new Uint8Array(blob) : blob;
  let best = '';
  let current = '';
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    if (b >= 32 && b < 127) {
      current += String.fromCharCode(b);
    } else if (b === 9 || b === 10 || b === 13) {
      current += b === 10 ? '\n' : b === 13 ? '' : ' ';
    } else if (b >= 0xc0) {
      const seq = tryReadUtf8Char(arr, i);
      if (seq) {
        current += seq.s;
        i = seq.end - 1;
      } else {
        if (current.length > best.length && current.length >= 3) best = current;
        current = '';
      }
    } else {
      if (current.length > best.length && current.length >= 3) best = current;
      current = '';
    }
  }
  if (current.length > best.length && current.length >= 3) best = current;
  return best.trim() || null;
}

function tryReadUtf8Char(arr: Uint8Array, i: number): { s: string; end: number } | null {
  const b = arr[i];
  if (b < 0x80) return null;
  if (b >= 0xc2 && b <= 0xdf && i + 1 < arr.length) {
    const b1 = arr[i + 1];
    if (b1 >= 0x80 && b1 <= 0xbf) {
      return { s: String.fromCharCode(((b & 0x1f) << 6) | (b1 & 0x3f)), end: i + 2 };
    }
  }
  if (b >= 0xe0 && b <= 0xef && i + 2 < arr.length) {
    const b1 = arr[i + 1], b2 = arr[i + 2];
    if (b1 >= 0x80 && b1 <= 0xbf && b2 >= 0x80 && b2 <= 0xbf) {
      return { s: String.fromCharCode(((b & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f)), end: i + 3 };
    }
  }
  if (b >= 0xf0 && b <= 0xf4 && i + 3 < arr.length) {
    const b1 = arr[i + 1], b2 = arr[i + 2], b3 = arr[i + 3];
    if (b1 >= 0x80 && b1 <= 0xbf && b2 >= 0x80 && b2 <= 0xbf && b3 >= 0x80 && b3 <= 0xbf) {
      const cp = ((b & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      if (cp <= 0x10ffff) return { s: String.fromCodePoint(cp), end: i + 4 };
    }
  }
  return null;
}

export interface TranscriptBatch {
  transcript: string;
  chatIdentifier: string;
  batchIndex: number;
  messageCount: number;
}

const BATCH_CHAR_LIMIT = 2500;
const BATCH_MESSAGE_LIMIT = 80;

type SqlJsStatic = Awaited<ReturnType<typeof import('sql.js')>>;
type SqlJsDb = InstanceType<SqlJsStatic['Database']>;

let sqlJs: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlJs) return sqlJs;
  const initSqlJs = require('sql.js') as (config?: { locateFile?: (f: string) => string }) => Promise<SqlJsStatic>;
  sqlJs = await initSqlJs({
    locateFile: (file: string) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  });
  return sqlJs;
}

export function getMessagesDbPath(): string {
  return MESSAGES_DB_PATH;
}

export function canAccessMessagesDb(appPath?: string): { ok: boolean; error?: string } {
  const dbPath = MESSAGES_DB_PATH;
  if (!existsSync(dbPath)) {
    return { ok: false, error: 'Messages database not found. Is iMessage installed?' };
  }
  try {
    const buffer = readFileSync(dbPath);
    if (buffer.length === 0) {
      return { ok: false, error: 'Messages database is empty.' };
    }
    return { ok: true };
  } catch (err: unknown) {
    console.error('[Enk] Messages DB access error (full):', err);
    if (appPath) {
      const electronApp = path.join(appPath, 'node_modules', 'electron', 'dist', 'Electron.app');
      console.error('[Enk] FDA must be granted to this EXACT app:', electronApp);
    }
    const msg = err instanceof Error ? err.message : String(err);
    const code = err instanceof Error && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
    if (
      msg.includes('EACCES') ||
      msg.includes('EPERM') ||
      msg.includes('permission') ||
      msg.includes('Operation not permitted') ||
      code === 'EACCES' ||
      code === 'EPERM'
    ) {
      const electronPath = appPath
        ? path.join(appPath, 'node_modules', 'electron', 'dist', 'Electron.app')
        : 'node_modules/electron/dist/Electron.app (inside your project folder)';
      return {
        ok: false,
        error: `Cannot access Messages. Add Electron to Full Disk Access:\n\n${electronPath}\n\n1. System Settings → Privacy & Security → Full Disk Access\n2. If Electron is listed: remove it (–), then add again\n3. Press + → Cmd+Shift+G → paste path → Open → select Electron.app\n4. Ensure the toggle is ON. Fully quit Enk (Cmd+Q) and restart`,
      };
    }
    return { ok: false, error: msg };
  }
}

/**
 * List all chats with at least one message, ordered by most recent activity (top chats first).
 */
export function listChats(db: SqlJsDb): ChatInfo[] {
  try {
    const result = db.exec(`
      SELECT c.ROWID as chat_id, c.chat_identifier, MIN(h.id) as handle_id
      FROM chat c
      JOIN chat_handle_join chj ON c.ROWID = chj.chat_id
      JOIN handle h ON chj.handle_id = h.ROWID
      JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
      JOIN message m ON cmj.message_id = m.ROWID
      WHERE c.chat_identifier IS NOT NULL AND c.chat_identifier != ''
      GROUP BY c.ROWID, c.chat_identifier
      ORDER BY MAX(m.date) DESC
    `);
    if (!result.length || !result[0].values.length) return [];

    const columns = result[0].columns;
    const rows = result[0].values;
    const chatIdx = columns.indexOf('chat_id');
    const identIdx = columns.indexOf('chat_identifier');
    const handleIdx = columns.indexOf('handle_id');
    if (chatIdx < 0 || identIdx < 0 || handleIdx < 0) return [];

    const seen = new Set<string>();
    const out: ChatInfo[] = [];
    for (const row of rows) {
      const chatId = row[chatIdx] as number;
      const chatIdentifier = String(row[identIdx] ?? '');
      const handleId = String(row[handleIdx] ?? '');
      const key = `${chatId}-${chatIdentifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ chatId, chatIdentifier, handleId });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Fetch messages for a chat, ordered by date.
 * On macOS Ventura+, text is often in attributedBody; we extract when text is empty.
 */
export function fetchMessagesForChat(db: SqlJsDb, chatId: number): MessageRow[] {
  try {
    const stmt = db.prepare(`
      SELECT m.ROWID as rowid, m.text, m.attributedBody, m.date, m.is_from_me,
             COALESCE(h.id, '') as handle_id
      FROM message m
      JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE cmj.chat_id = ?
      ORDER BY m.date ASC
    `);
    stmt.bind([chatId]);
    const out: MessageRow[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      let text: string | null = row.text != null && String(row.text).trim() ? String(row.text) : null;
      if (!text && row.attributedBody != null) {
        const blob = row.attributedBody as Uint8Array | Buffer;
        text = extractTextFromAttributedBody(blob);
      }
      out.push({
        rowid: Number(row.rowid ?? 0),
        text,
        date: Number(row.date ?? 0),
        isFromMe: Number(row.is_from_me ?? 0),
        handleId: String(row.handle_id ?? ''),
      });
    }
    stmt.free();
    return out;
  } catch (err) {
    try {
      const stmt = db.prepare(`
        SELECT m.ROWID as rowid, m.text, m.date, m.is_from_me, COALESCE(h.id, '') as handle_id
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE cmj.chat_id = ?
        ORDER BY m.date ASC
      `);
      stmt.bind([chatId]);
      const out: MessageRow[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        out.push({
          rowid: Number(row.rowid ?? 0),
          text: row.text != null ? String(row.text) : null,
          date: Number(row.date ?? 0),
          isFromMe: Number(row.is_from_me ?? 0),
          handleId: String(row.handle_id ?? ''),
        });
      }
      stmt.free();
      return out;
    } catch {
      return [];
    }
  }
}

function displayName(handleId: string, chatIdentifier: string): string {
  if (handleId) return handleId;
  return chatIdentifier || 'Unknown';
}

/**
 * Build transcript batches for a single chat.
 */
export function buildTranscriptBatches(
  messages: MessageRow[],
  chatIdentifier: string,
  contactDisplayName: string
): TranscriptBatch[] {
  const lines: string[] = [];
  for (const m of messages) {
    const text = (m.text || '').trim();
    if (!text) continue;
    const speaker = m.isFromMe ? 'You' : (m.handleId || contactDisplayName);
    lines.push(`[${speaker}]: ${text}`);
  }

  const batches: TranscriptBatch[] = [];
  let currentBatch: string[] = [];
  let currentLen = 0;
  let msgCount = 0;

  for (const line of lines) {
    const lineLen = line.length + 1;
    if ((currentLen + lineLen > BATCH_CHAR_LIMIT || msgCount >= BATCH_MESSAGE_LIMIT) && currentBatch.length > 0) {
      batches.push({
        transcript: currentBatch.join('\n'),
        chatIdentifier,
        batchIndex: batches.length,
        messageCount: currentBatch.length,
      });
      currentBatch = [];
      currentLen = 0;
      msgCount = 0;
    }
    currentBatch.push(line);
    currentLen += lineLen;
    msgCount++;
  }
  if (currentBatch.length > 0) {
    batches.push({
      transcript: currentBatch.join('\n'),
      chatIdentifier,
      batchIndex: batches.length,
      messageCount: currentBatch.length,
    });
  }
  return batches;
}

/** Max messages per chat to seed from (most recent). */
export const MAX_MESSAGES_PER_CHAT = 1000;

export function getBatchesForChat(db: SqlJsDb, chat: ChatInfo): TranscriptBatch[] {
  const messages = fetchMessagesForChat(db, chat.chatId);
  if (messages.length === 0) return [];
  const recent = messages.length > MAX_MESSAGES_PER_CHAT ? messages.slice(-MAX_MESSAGES_PER_CHAT) : messages;
  const contactName = displayName(chat.handleId, chat.chatIdentifier);
  return buildTranscriptBatches(recent, chat.chatIdentifier, contactName).filter(
    (b) => b.transcript.length >= 50
  );
}

/**
 * Open the Messages DB. Caller must close when done. Fetch the whole file into memory (sql.js requirement).
 */
export async function openMessagesDb(): Promise<SqlJsDb> {
  const access = canAccessMessagesDb();
  if (!access.ok) throw new Error(access.error);

  const SQL = await getSqlJs();
  const buffer = readFileSync(MESSAGES_DB_PATH);
  const db = new SQL.Database(buffer);
  return db;
}
