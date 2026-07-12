import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseCodexSessionMeta,
  extractCodexContextTokens,
  extractCodexLastActivity,
  extractCodexRateLimits,
  extractCodexTotalTokens,
} from './parseCodexRollout';
import type { CodexRateLimitSnapshot } from './parseCodexRollout';
import { jstDateString } from '../claude/ClaudeStatusWatcher';
import type { AgentInfo, TodayStats } from '../claude/types';

// Codex rollout (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`) を読み取り専用でスキャンし、
// 現ワークスペース配下・保持期間内の Codex セッションを AgentInfo[] として返す。
//
// Codex には agent-status DB へ状態を POST するライフサイクルフックが無いため、
// editing/commit/handoff は出せない。「最終アクティビティ」と「コンテキストトークン」のみ抽出する。

const DEFAULT_CACHE_TTL_MS = 15_000;
const DEFAULT_MAX_FILES = 200;
/**
 * rollout のパス日付は **セッション開始日**。保持期間内の開始日だけを走査すると、
 * 開始が古く最近まで継続した長寿命セッションを取り逃がす。走査窓を保持期間 + マージン日
 * に広げ、採否はファイル mtime / 末尾 timestamp（最終アクティビティ）で判定する。
 */
const DEFAULT_MARGIN_DAYS = 2;
const META_MAX_BYTES = 256 * 1024;
const TAIL_STAGE_BYTES = [16 * 1024, 64 * 1024, 256 * 1024, 1024 * 1024];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CodexSessionScannerOptions {
  /** ルート。既定 `~/.codex/sessions`。テストでは一時ディレクトリを渡す。 */
  readonly rootDir?: string;
  /** 採否の経過時間しきい値（`anytimeAgent.sessionRetentionDays`）。 */
  readonly retentionDays: number;
  /** 注入クロック（テスト用）。 */
  readonly now?: () => Date;
  /** silent catch 禁止: 例外・打ち切りはこのロガーへ。既定 console.warn。 */
  readonly logger?: (message: string) => void;
  readonly cacheTtlMs?: number;
  readonly maxFiles?: number;
  readonly marginDays?: number;
}

interface CacheEntry {
  readonly key: string;
  readonly at: number;
  readonly result: readonly AgentInfo[];
  readonly usageSnapshot: CodexRateLimitSnapshot | null;
  readonly todayStats: TodayStats;
}

/** realpath で解決し末尾スラッシュを除去する（シンボリックリンク/相対 cwd の正規化）。 */
function normalizePath(p: string): string {
  if (!p) return '';
  let resolved = p;
  try {
    resolved = fs.realpathSync(p);
  } catch {
    // 既に削除された worktree など realpath 不可な場合は生パスを正規化して使う。
    resolved = path.resolve(p);
  }
  return resolved.endsWith('/') && resolved.length > 1 ? resolved.slice(0, -1) : resolved;
}

/** wt が cwd の接頭辞（同一含む）か。Codex の cwd は worktree のサブディレクトリであり得る。 */
function isWithin(cwd: string, normWorktrees: readonly string[]): boolean {
  return normWorktrees.some((wt) => cwd === wt || cwd.startsWith(`${wt}/`));
}

/**
 * [now-(retentionDays+margin), now+1day] を覆う YYYY/MM/DD の相対パス集合を生成。
 * 末尾を UTC 基準で生成するが、Codex がローカル時刻でディレクトリを切る環境（UTC+）では
 * 当日ローカル日付が UTC より先行し得るため、未来方向に 1 日分の余裕（i=-1）を持たせる。
 * 採否はパス日付ではなく mtime / 末尾 timestamp で行うため、空振りの 1 readdir 以上の害は無い。
 */
function targetDateDirs(now: Date, days: number, margin: number): string[] {
  const out: string[] = [];
  const total = Math.max(0, days + margin);
  for (let i = -1; i <= total; i++) {
    const d = new Date(now.getTime() - i * MS_PER_DAY);
    const y = d.getUTCFullYear().toString().padStart(4, '0');
    const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = d.getUTCDate().toString().padStart(2, '0');
    out.push(path.join(y, m, day));
  }
  return out;
}

/** 先頭 1 行を改行まで完全読み。上限超過は null（呼び出し側で warn）。 */
function readFirstLine(fd: number, maxBytes: number): string | null {
  const chunk = Buffer.alloc(64 * 1024);
  let acc = '';
  let pos = 0;
  while (pos < maxBytes) {
    const want = Math.min(chunk.length, maxBytes - pos);
    const read = fs.readSync(fd, chunk, 0, want, pos);
    if (read === 0) break;
    acc += chunk.toString('utf8', 0, read);
    const nl = acc.indexOf('\n');
    if (nl !== -1) return acc.slice(0, nl);
    pos += read;
  }
  // 改行が見つからない: ファイル全体（小さい）か、上限超過。上限到達なら null。
  return pos >= maxBytes ? null : acc;
}

function readLastBytes(fd: number, fileSize: number, n: number): string {
  const size = Math.min(n, fileSize);
  if (size <= 0) return '';
  const buf = Buffer.alloc(size);
  fs.readSync(fd, buf, 0, size, fileSize - size);
  return buf.toString('utf8');
}

interface TailResult {
  readonly contextTokens: number | null;
  readonly lastActivity: string;
  readonly rateLimitSnapshot: CodexRateLimitSnapshot | null;
  readonly totalTokens: number | null;
}

function extractTail(text: string): TailResult {
  return {
    contextTokens: extractCodexContextTokens(text),
    lastActivity: extractCodexLastActivity(text),
    rateLimitSnapshot: extractCodexRateLimits(text),
    totalTokens: extractCodexTotalTokens(text),
  };
}

/**
 * token_count を検出するまで末尾を段階的に読み増す。上限まで無ければ contextTokens=null。
 *
 * 打ち切りは contextTokens のみで判定する。rate_limits / total_token_usage は同じ token_count
 * イベントに載るため、token_count を見つけた後に読み増しても新しい情報は増えない。3 値すべてが
 * 揃うまで読み増すと、rate_limits を持たない旧形式の rollout で毎回 1MB まで読み上げてしまう。
 */
function readTail(fd: number, fileSize: number): TailResult {
  let result: TailResult = { contextTokens: null, lastActivity: '', rateLimitSnapshot: null, totalTokens: null };
  for (const stage of TAIL_STAGE_BYTES) {
    result = extractTail(readLastBytes(fd, fileSize, stage));
    if (result.contextTokens !== null) {
      return result;
    }
    if (stage >= fileSize) break; // ファイル全体を読み切った
  }
  return result;
}

interface RolloutReadResult {
  readonly agent: AgentInfo | null;
  readonly rateLimitSnapshot: CodexRateLimitSnapshot | null;
  readonly todayTokens: number | null;
  readonly isTodaySession: boolean;
}

export class CodexSessionScanner {
  private readonly rootDir: string;
  private readonly retentionDays: number;
  private readonly nowFn: () => Date;
  private readonly logger: (message: string) => void;
  private readonly cacheTtlMs: number;
  private readonly maxFiles: number;
  private readonly marginDays: number;
  private cache: CacheEntry | null = null;
  private usageSnapshot: CodexRateLimitSnapshot | null = null;
  private todayStats: TodayStats = { sessionCount: 0, totalTokens: 0 };

  constructor(options: CodexSessionScannerOptions) {
    this.rootDir = options.rootDir ?? path.join(os.homedir(), '.codex', 'sessions');
    this.retentionDays = options.retentionDays;
    this.nowFn = options.now ?? (() => new Date());
    this.logger = options.logger ?? ((m) => console.warn(m));
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    this.marginDays = options.marginDays ?? DEFAULT_MARGIN_DAYS;
  }

  /** 現ワークスペースの worktree ルート群を渡し、配下・保持期間内の Codex セッションを返す。 */
  scan(worktreePaths: readonly string[]): readonly AgentInfo[] {
    const now = this.nowFn();
    const normWorktrees = worktreePaths.map(normalizePath).filter((p) => p !== '');
    const key = [...normWorktrees].sort((a, b) => a.localeCompare(b)).join('|');

    const cached = this.cache;
    if (cached !== null && cached.key === key && now.getTime() - cached.at <= this.cacheTtlMs) {
      this.usageSnapshot = cached.usageSnapshot;
      this.todayStats = cached.todayStats;
      return cached.result;
    }

    const { result, usageSnapshot, todayStats } = this.scanUncached(now, normWorktrees);
    this.usageSnapshot = usageSnapshot;
    this.todayStats = todayStats;
    this.cache = { key, at: now.getTime(), result, usageSnapshot, todayStats };
    return result;
  }

  getUsageSnapshot(): CodexRateLimitSnapshot | null {
    const snapshot = this.usageSnapshot;
    if (snapshot === null) {
      return null;
    }
    const nowMs = this.nowFn().getTime();
    const rows = snapshot.rows.filter(row => {
      if (row.resetsAt === null) {
        return false;
      }
      const resetMs = new Date(row.resetsAt).getTime();
      return !Number.isNaN(resetMs) && resetMs > nowMs;
    });
    return rows.length > 0 ? { observedAt: snapshot.observedAt, rows } : null;
  }

  getTodayStats(): TodayStats {
    return this.todayStats;
  }

  private scanUncached(
    now: Date,
    normWorktrees: readonly string[],
  ): { readonly result: readonly AgentInfo[]; readonly usageSnapshot: CodexRateLimitSnapshot | null; readonly todayStats: TodayStats } {
    if (normWorktrees.length === 0) {
      return { result: [], usageSnapshot: null, todayStats: { sessionCount: 0, totalTokens: 0 } };
    }
    const files = this.collectRolloutFiles(now);
    const retentionMs = this.retentionDays * MS_PER_DAY;
    const out: AgentInfo[] = [];
    let usageSnapshot: CodexRateLimitSnapshot | null = null;
    let todaySessionCount = 0;
    let todayTotalTokens = 0;

    for (const file of files) {
      const read = this.readRollout(file, normWorktrees, now, retentionMs);
      if (read === null) {
        continue;
      }
      if (read.agent !== null) {
        out.push(read.agent);
      }
      if (read.rateLimitSnapshot !== null && this.isNewerSnapshot(read.rateLimitSnapshot, usageSnapshot)) {
        usageSnapshot = read.rateLimitSnapshot;
      }
      if (read.isTodaySession) {
        todaySessionCount++;
        todayTotalTokens += read.todayTokens ?? 0;
      }
    }
    // 最近順（最終アクティビティ降順）。
    out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return {
      result: out,
      usageSnapshot,
      todayStats: { sessionCount: todaySessionCount, totalTokens: todayTotalTokens },
    };
  }

  private isNewerSnapshot(
    candidate: CodexRateLimitSnapshot,
    current: CodexRateLimitSnapshot | null,
  ): boolean {
    if (current === null) {
      return true;
    }
    return candidate.observedAt.localeCompare(current.observedAt) > 0;
  }

  /** 走査窓内の日付ディレクトリだけを readdir し rollout ファイルパスを集める（上限あり）。 */
  private collectRolloutFiles(now: Date): string[] {
    const files: string[] = [];
    for (const rel of targetDateDirs(now, this.retentionDays, this.marginDays)) {
      const dir = path.join(this.rootDir, rel);
      let names: string[];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue; // その日のディレクトリが無いのは正常。
      }
      for (const name of names) {
        if (name.startsWith('rollout-') && name.endsWith('.jsonl')) {
          files.push(path.join(dir, name));
          if (files.length >= this.maxFiles) {
            this.logger(
              `[codex-scanner] reached maxFiles=${this.maxFiles}; truncating scan (some Codex sessions may be hidden)`
            );
            return files;
          }
        }
      }
    }
    return files;
  }

  private readRollout(
    file: string,
    normWorktrees: readonly string[],
    now: Date,
    retentionMs: number
  ): RolloutReadResult | null {
    let fd: number | null = null;
    try {
      const stat = fs.statSync(file);
      fd = fs.openSync(file, 'r');

      const firstLine = readFirstLine(fd, META_MAX_BYTES);
      if (firstLine === null) {
        this.logger(`[codex-scanner] first line exceeds ${META_MAX_BYTES}B; skipping: ${file}`);
        return null;
      }
      const meta = parseCodexSessionMeta(firstLine);
      if (meta === null) return null;

      const cwd = normalizePath(meta.cwd);
      const tail = readTail(fd, stat.size);
      // 最終アクティビティ = tail の末尾 timestamp。無ければ mtime（開始日近似の補正）。
      const lastActivity = tail.lastActivity || stat.mtime.toISOString();
      if (now.getTime() - new Date(lastActivity).getTime() > retentionMs) {
        return null; // 保持期間外。
      }
      const withinWorktree = isWithin(cwd, normWorktrees);
      const todayJst = jstDateString(now);
      const activityDate = new Date(lastActivity);
      const isTodaySession = withinWorktree
        && !Number.isNaN(activityDate.getTime())
        && jstDateString(activityDate) === todayJst;

      return {
        agent: withinWorktree ? {
          sessionId: meta.sessionId,
          source: 'codex',
          editing: false,
          file: '',
          timestamp: lastActivity,
          branch: '',
          sessionEdits: [],
          plannedEdits: [],
          workspacePath: cwd,
          contextTokens: tail.contextTokens ?? undefined,
        } : null,
        rateLimitSnapshot: tail.rateLimitSnapshot,
        todayTokens: tail.totalTokens,
        isTodaySession,
      };
    } catch (err) {
      this.logger(`[codex-scanner] failed to read rollout ${file}: ${String(err)}`);
      return null;
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch (err) {
          this.logger(`[codex-scanner] failed to close fd for ${file}: ${String(err)}`);
        }
      }
    }
  }
}
