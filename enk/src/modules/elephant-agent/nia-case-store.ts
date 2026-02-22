import path from 'path';
import { app } from 'electron';

import type { CaseRecord, NowState, RetrievedCase } from './types';

let db: any = null;

function getDatabase(): any {
  if (db) return db;

  const Database = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'enk-nia-cases.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS case_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT,
      correlation_id TEXT,
      timestamp INTEGER,
      state_signature TEXT,
      app TEXT,
      mode TEXT,
      sender TEXT,
      sender_domain TEXT,
      subject TEXT,
      intent TEXT,
      entities_json TEXT,
      suggestion_label TEXT,
      actions_json TEXT,
      outcome TEXT,
      outcome_meta_json TEXT,
      now_state_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_case_timestamp ON case_records(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_case_sender_domain ON case_records(sender_domain);
    CREATE INDEX IF NOT EXISTS idx_case_intent ON case_records(intent);
  `);

  return db;
}

function toCaseRecord(row: any): CaseRecord {
  return {
    case_id: row.case_id,
    correlation_id: row.correlation_id,
    timestamp: row.timestamp,
    state_signature: row.state_signature,
    now_state: JSON.parse(row.now_state_json),
    intent: row.intent,
    suggestion_label: row.suggestion_label,
    actions_taken: JSON.parse(row.actions_json || '[]'),
    outcome: row.outcome,
    outcome_meta: JSON.parse(row.outcome_meta_json || '{}')
  };
}

function createStateSignature(nowState: NowState): string {
  return [
    nowState.app,
    nowState.mode,
    nowState.sender_domain || 'unknown-domain',
    nowState.intent,
    nowState.subject ? nowState.subject.toLowerCase().slice(0, 40) : 'no-subject'
  ].join('|');
}

function writeCaseRecord(record: CaseRecord): void {
  const database = getDatabase();

  const stmt = database.prepare(`
    INSERT INTO case_records (
      case_id,
      correlation_id,
      timestamp,
      state_signature,
      app,
      mode,
      sender,
      sender_domain,
      subject,
      intent,
      entities_json,
      suggestion_label,
      actions_json,
      outcome,
      outcome_meta_json,
      now_state_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    record.case_id,
    record.correlation_id,
    record.timestamp,
    record.state_signature,
    record.now_state.app,
    record.now_state.mode,
    record.now_state.sender,
    record.now_state.sender_domain,
    record.now_state.subject,
    record.intent,
    JSON.stringify(record.now_state.entities || []),
    record.suggestion_label,
    JSON.stringify(record.actions_taken || []),
    record.outcome,
    JSON.stringify(record.outcome_meta || {}),
    JSON.stringify(record.now_state)
  );
}

function scoreCaseMatch(nowState: NowState, record: CaseRecord): number {
  let score = 0;

  if (record.now_state.sender_domain && nowState.sender_domain && record.now_state.sender_domain === nowState.sender_domain) {
    score += 0.4;
  }

  if (record.intent === nowState.intent) {
    score += 0.3;
  }

  if (record.now_state.mode === nowState.mode) {
    score += 0.15;
  }

  const currentEntities = new Set(nowState.entities);
  const sharedEntities = (record.now_state.entities || []).filter((entity) => currentEntities.has(entity));
  score += Math.min(0.15, sharedEntities.length * 0.05);

  return Math.round(score * 100) / 100;
}

function queryCaseRecords(nowState: NowState, limit = 12): { records: RetrievedCase[]; embedding_supported: false } {
  const database = getDatabase();

  const rows = database
    .prepare(
      `
      SELECT *
      FROM case_records
      WHERE app = ?
      ORDER BY timestamp DESC
      LIMIT 250
    `
    )
    .all(nowState.app);

  const scored: RetrievedCase[] = rows
    .map((row: any) => {
      const record = toCaseRecord(row);
      return {
        record,
        score: scoreCaseMatch(nowState, record)
      };
    })
    .filter((item: RetrievedCase) => item.score > 0)
    .sort((a: RetrievedCase, b: RetrievedCase) => b.score - a.score)
    .slice(0, limit);

  return {
    records: scored,
    embedding_supported: false
  };
}

export { createStateSignature, writeCaseRecord, queryCaseRecords };
