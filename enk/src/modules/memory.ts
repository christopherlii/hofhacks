import path from 'path';
import { app } from 'electron';
import type { NowContext } from '../types';

interface SnapshotInput {
  activeApp: string | null;
  windowTitle: string | null;
  url: string | null;
  visibleText: string | null;
}

let db: any = null;

function initDB(): void {
  const Database = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'enk-memory.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      active_app TEXT,
      window_title TEXT,
      url TEXT,
      visible_text TEXT,
      last_actions TEXT,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      active_app TEXT,
      window_title TEXT,
      url TEXT,
      summary TEXT,
      entities TEXT,
      start_timestamp INTEGER,
      end_timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT,
      item_type TEXT,
      is_positive INTEGER,
      context_app TEXT,
      context_url TEXT,
      timestamp INTEGER
    );
  `);

  console.log('[Enk] Memory DB initialized at', dbPath);
}

function saveSnapshot(context: SnapshotInput | NowContext): void {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT INTO snapshots (active_app, window_title, url, visible_text, last_actions, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    context.activeApp,
    context.windowTitle,
    context.url,
    context.visibleText?.slice(0, 5000),
    null,
    Date.now()
  );
}

function queryMemory(activeApp: string | null, url: string | null, _visibleText: string): any[] {
  if (!db) return [];

  const results: any[] = [];

  if (activeApp && url) {
    const tier1 = db
      .prepare(`
      SELECT * FROM snapshots
      WHERE active_app = ? AND url = ?
      ORDER BY timestamp DESC LIMIT 5
    `)
      .all(activeApp, url);
    results.push(...tier1);
  }

  if (activeApp && url) {
    const sessionMatches = db
      .prepare(`
      SELECT * FROM sessions
      WHERE active_app = ? AND url = ?
      ORDER BY end_timestamp DESC LIMIT 3
    `)
      .all(activeApp, url);
    results.push(...sessionMatches);
  }

  if (activeApp && results.length < 5) {
    const tier2 = db
      .prepare(`
      SELECT * FROM snapshots
      WHERE active_app = ? AND (url IS NULL OR url != ?)
      ORDER BY timestamp DESC LIMIT ?
    `)
      .all(activeApp, url || '', 5 - results.length);
    results.push(...tier2);
  }

  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const r of results) {
    const key = `${r.id}-${r.active_app}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
    if (deduped.length >= 5) break;
  }

  return deduped;
}

function saveFeedback(
  itemId: string,
  itemType: string,
  isPositive: boolean,
  contextApp: string | null,
  contextUrl: string | null
): void {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT INTO feedback (item_id, item_type, is_positive, context_app, context_url, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(itemId, itemType, isPositive ? 1 : 0, contextApp, contextUrl, Date.now());
}

function cleanup(maxAgeDays = 30): void {
  if (!db) return;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM snapshots WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM sessions WHERE end_timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM feedback WHERE timestamp < ?').run(cutoff);
  console.log('[Enk] Memory cleanup complete (removed entries older than', maxAgeDays, 'days)');
}

export { initDB, saveSnapshot, queryMemory, saveFeedback, cleanup };
