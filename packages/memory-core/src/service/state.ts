import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { MemoryCoreServiceStatus } from './types';

export const STATE_SCHEMA_VERSION = 1;

export function defaultState(): MemoryCoreServiceStatus {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
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
}

export function readState(path: string, opts: ReadStateOptions = {}): MemoryCoreServiceStatus {
  if (!existsSync(path)) return defaultState();
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    opts.onWarning?.(`failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return defaultState();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    opts.onWarning?.(`failed to parse ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return defaultState();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    opts.onWarning?.(`unexpected shape in ${path} (not an object)`);
    return defaultState();
  }
  const obj = parsed as Partial<MemoryCoreServiceStatus>;
  if (obj.schemaVersion !== STATE_SCHEMA_VERSION) {
    opts.onWarning?.(
      `schemaVersion mismatch in ${path}: expected ${STATE_SCHEMA_VERSION}, got ${String(obj.schemaVersion)}`,
    );
    return defaultState();
  }
  // running is a runtime-only flag; never trust a persisted true (process crashed mid-run).
  return { ...defaultState(), ...obj, running: false };
}

export function writeState(path: string, state: MemoryCoreServiceStatus): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmpPath, path);
}
