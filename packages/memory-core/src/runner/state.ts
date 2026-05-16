import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { RunnerStatus } from './types';

export const DEFAULT_STATE_SCHEMA_VERSION = 1;

export function defaultState(schemaVersion: number = DEFAULT_STATE_SCHEMA_VERSION): RunnerStatus {
  return {
    schemaVersion,
    paused: false,
    pausedAt: null,
    pausedBy: null,
    lastRunAt: null,
    lastDurationMs: null,
    lastReason: null,
    lastError: null,
    ticksRun: 0,
    ticksSkipped: 0,
    running: false,
  };
}

export interface ReadStateOptions {
  /** Schema mismatch / parse failure を通知するコールバック */
  onWarning?: (msg: string) => void;
  /** state ファイルの期待 schemaVersion (省略時は 1) */
  expectedSchemaVersion?: number;
}

export function readState(path: string, opts: ReadStateOptions = {}): RunnerStatus {
  const expectedSv = opts.expectedSchemaVersion ?? DEFAULT_STATE_SCHEMA_VERSION;
  if (!existsSync(path)) return defaultState(expectedSv);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    opts.onWarning?.(`failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return defaultState(expectedSv);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    opts.onWarning?.(`failed to parse ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return defaultState(expectedSv);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    opts.onWarning?.(`unexpected shape in ${path} (not an object)`);
    return defaultState(expectedSv);
  }
  const obj = parsed as Partial<RunnerStatus>;
  if (obj.schemaVersion !== expectedSv) {
    opts.onWarning?.(
      `schemaVersion mismatch in ${path}: expected ${expectedSv}, got ${String(obj.schemaVersion)}`,
    );
    return defaultState(expectedSv);
  }
  // running は runtime-only。永続された true はクラッシュ痕跡として false に戻す。
  return { ...defaultState(expectedSv), ...obj, running: false };
}

export function writeState(path: string, state: RunnerStatus): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmpPath, path);
}
