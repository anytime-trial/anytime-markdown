import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { UsageLimitRow, UsageSeverity } from './parseClaudeUsage';
import type { ClaudeUsageSnapshot } from './types';

export type ClaudeUsageCacheReadResult =
  | { readonly kind: 'hit'; readonly snapshot: ClaudeUsageSnapshot }
  | { readonly kind: 'missing'; readonly snapshot: null }
  | { readonly kind: 'invalid'; readonly snapshot: null; readonly message: string }
  | { readonly kind: 'error'; readonly snapshot: null; readonly message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFileNotFound(err: unknown): boolean {
  return isRecord(err) && err.code === 'ENOENT';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isSeverity(value: unknown): value is UsageSeverity {
  return value === 'normal' || value === 'warn' || value === 'critical';
}

function parseRow(value: unknown): UsageLimitRow | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.key !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.percent !== 'number' ||
    !Number.isFinite(value.percent) ||
    !isSeverity(value.severity) ||
    !(typeof value.resetsAt === 'string' || value.resetsAt === null)
  ) {
    return null;
  }
  return {
    key: value.key,
    label: value.label,
    percent: value.percent,
    severity: value.severity,
    resetsAt: value.resetsAt,
  };
}

function parseSnapshot(value: unknown): ClaudeUsageSnapshot | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.rows)) {
    return null;
  }
  if (
    !isIsoDate(value.fetchedAt) ||
    !(value.backoffUntil === null || isIsoDate(value.backoffUntil)) ||
    typeof value.failureCount !== 'number' ||
    !Number.isInteger(value.failureCount) ||
    value.failureCount < 0
  ) {
    return null;
  }
  const rows = value.rows.map(parseRow);
  if (rows.some(row => row === null)) {
    return null;
  }
  return {
    version: 1,
    rows: rows.filter((row): row is UsageLimitRow => row !== null),
    fetchedAt: new Date(value.fetchedAt).toISOString(),
    backoffUntil: value.backoffUntil === null ? null : new Date(value.backoffUntil).toISOString(),
    failureCount: value.failureCount,
  };
}

export class ClaudeUsageCache {
  constructor(private readonly cachePath: string) {}

  async read(): Promise<ClaudeUsageCacheReadResult> {
    let text: string;
    try {
      text = await fs.readFile(this.cachePath, 'utf-8');
    } catch (err) {
      if (isFileNotFound(err)) {
        return { kind: 'missing', snapshot: null };
      }
      return {
        kind: 'error',
        snapshot: null,
        message: `Failed to read Claude usage cache ${this.cachePath}: ${errorMessage(err)}`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return {
        kind: 'invalid',
        snapshot: null,
        message: `Claude usage cache JSON is invalid at ${this.cachePath}: ${errorMessage(err)}`,
      };
    }

    const snapshot = parseSnapshot(parsed);
    if (snapshot === null) {
      return {
        kind: 'invalid',
        snapshot: null,
        message: `Claude usage cache shape is invalid at ${this.cachePath}`,
      };
    }
    return { kind: 'hit', snapshot };
  }

  /**
   * 一時ファイル + rename でアトミックに置き換える。一時ファイル名は毎回一意でなければならない
   * （pid + 時刻だけだと、同一プロセスの同一ミリ秒に重なった 2 本の write が同じ一時ファイルを
   * 奪い合い、後発の rename が ENOENT で落ちる）。
   */
  async write(snapshot: ClaudeUsageSnapshot): Promise<void> {
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    const tmpPath = `${this.cachePath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
    await fs.rename(tmpPath, this.cachePath);
  }

  async remove(): Promise<void> {
    await fs.rm(this.cachePath, { force: true });
  }
}
