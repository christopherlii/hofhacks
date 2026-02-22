import fs from 'fs';
import path from 'path';
import { app } from 'electron';

interface LogEvent {
  timestamp: string;
  event: string;
  correlation_id: string;
  payload: Record<string, unknown>;
}

function getLogPath(): string {
  try {
    return path.join(app.getPath('userData'), 'enk-elephant-events.ndjson');
  } catch {
    return path.join(process.cwd(), 'enk-elephant-events.ndjson');
  }
}

function logElephantEvent(event: string, correlationId: string, payload: Record<string, unknown>): void {
  const row: LogEvent = {
    timestamp: new Date().toISOString(),
    event,
    correlation_id: correlationId,
    payload
  };

  const serialized = JSON.stringify(row);
  console.log(`[Enk][Elephant] ${event}`, serialized);

  try {
    fs.appendFileSync(getLogPath(), `${serialized}\n`, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Enk][Elephant] Failed to append structured log:', message);
  }
}

export { logElephantEvent, getLogPath };
