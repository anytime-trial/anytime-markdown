import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseCodexSessionMeta,
  extractCodexContextTokens,
  extractCodexLastActivity,
} from './parseCodexRollout';
import type { AgentInfo } from '../claude/types';

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

/** [now-(retentionDays+margin), now] を覆う YYYY/MM/DD の相対パス集合を生成。 */
function targetDateDirs(now: Date, days: number, margin: number): string[] {
  const out: string[] = [];
  const total = Math.max(0, days + margin);
  for (let i = 0; i <= total; i++) {
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
}

/** token_count を検出するまで末尾を段階的に読み増す。上限まで無ければ contextTokens=null。 */
function readTail(fd: number, fileSize: number): TailResult {
  let text = '';
  for (const stage of TAIL_STAGE_BYTES) {
    text = readLastBytes(fd, fileSize, stage);
    const tokens = extractCodexContextTokens(text);
    if (tokens !== null) {
      return { contextTokens: tokens, lastActivity: extractCodexLastActivity(text) };
    }
    if (stage >= fileSize) break; // ファイル全体を読み切った
  }
  return { contextTokens: null, lastActivity: extractCodexLastActivity(text) };
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
      return cached.result;
    }

    const result = this.scanUncached(now, normWorktrees);
    this.cache = { key, at: now.getTime(), result };
    return result;
  }

  private scanUncached(now: Date, normWorktrees: readonly string[]): readonly AgentInfo[] {
    if (normWorktrees.length === 0) return [];
    const files = this.collectRolloutFiles(now);
    const retentionMs = this.retentionDays * MS_PER_DAY;
    const out: AgentInfo[] = [];

    for (const file of files) {
      const agent = this.readRollout(file, normWorktrees, now, retentionMs);
      if (agent !== null) out.push(agent);
    }
    // 最近順（最終アクティビティ降順）。
    out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return out;
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
  ): AgentInfo | null {
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
      if (!isWithin(cwd, normWorktrees)) return null;

      const tail = readTail(fd, stat.size);
      // 最終アクティビティ = tail の末尾 timestamp。無ければ mtime（開始日近似の補正）。
      const lastActivity = tail.lastActivity || stat.mtime.toISOString();
      if (now.getTime() - new Date(lastActivity).getTime() > retentionMs) {
        return null; // 保持期間外。
      }

      return {
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
