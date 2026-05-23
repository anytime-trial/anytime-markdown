import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

/**
 * Step 2b 以降の `SessionImporter` が「既にこの mainFile を import 済みか」を
 * 判定するための、当該 trail.db 行の現状値を返すフック。
 */
export interface ImportedFilesProvider {
  (mainFile: string): { fileSize: number; hasMessages: boolean; hasUsableCostData: boolean } | undefined;
}

export interface JsonlIngesterOptions {
  /** 主 git working tree (Codex セッションフィルタに使用)。省略時は Codex セッションも全件 emit */
  readonly gitRoot?: string;
  /** monitored repos (Codex 以外含む)。fallback repoName 解決に使用 */
  readonly repoName?: string;
  /**
   * trail.db の既存 import 状態をルックアップする (省略可)。
   * Step 2a 時点で SessionImporter は未実装のため、未指定の場合は全件「未 import 扱い」で emit する。
   */
  readonly importedFilesProvider?: ImportedFilesProvider;
  /**
   * Claude Code セッションログの探索元 (lep.json `sources.claude.projectsDir` / テスト上書き)。
   * 省略時は `os.homedir()/.claude/projects`。
   */
  readonly claudeProjectsDir?: string;
  /**
   * Codex セッションログの探索元 (lep.json `sources.codex.sessionsDir` / テスト上書き)。
   * 省略時は `os.homedir()/.codex/sessions`。
   */
  readonly codexSessionsDir?: string;
}

type SessionDescriptor = {
  sessionId: string;
  mainFile: string;
  subagentFiles: readonly string[];
  repoName: string;
  source: 'claude_code' | 'codex';
};

/**
 * Layer 1 Ingester: JSONL ファイルからセッションを発見し
 * `jsonl_session_discovered` event を emit する。
 *
 * Step 2a 時点では event の subscriber が存在しないため、event を流すのみ。
 * Step 2b の `SessionImporter` がこの event を購読して `importSession()` を呼ぶ。
 *
 * skip 判定 (file size unchanged) は本 Ingester では行わず、SessionImporter に委ねる
 * (Ingester は「無条件発見」に純化する。プラン 8 章リスク緩和策)。
 */
export class JsonlIngester implements Analyzer {
  readonly id = 'JsonlIngester';
  readonly tier = 1 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = [];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['jsonl_session_discovered'];

  constructor(private readonly opts: JsonlIngesterOptions = {}) {}

  // Ingester は Wave 実行フェーズ (onRunEnd) で source event を emit する。
  // 消費側 (tier-2 SessionImporter 等) は onRunStart (orchestrator Pass 1) で初期化済みのため、
  // ここで emit する jsonl_session_discovered を正しく処理できる。
  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    const sessions = this.discoverSessions();
    let emitted = 0;
    for (const desc of sessions) {
      let fileSize = 0;
      try {
        fileSize = fs.statSync(desc.mainFile).size;
      } catch {
        continue;
      }
      const importState = this.opts.importedFilesProvider?.(desc.mainFile);
      await ctx.bus.publish({
        kind: 'jsonl_session_discovered',
        sessionId: desc.sessionId,
        mainFile: desc.mainFile,
        subagentFiles: desc.subagentFiles,
        repoName: desc.repoName,
        source: desc.source,
        fileSize,
        hasMessages: importState?.hasMessages ?? false,
        hasUsableCostData: importState?.hasUsableCostData ?? false,
      });
      emitted++;
    }
    ctx.logger.info(`[JsonlIngester] discovered ${emitted} sessions`);
  }

  /** Internal: discover Claude Code + Codex sessions. */
  discoverSessions(): readonly SessionDescriptor[] {
    const claudeProjectsDir =
      this.opts.claudeProjectsDir ?? path.join(os.homedir(), '.claude', 'projects');
    const codexSessionsDir =
      this.opts.codexSessionsDir ?? path.join(os.homedir(), '.codex', 'sessions');

    const out: SessionDescriptor[] = [];
    out.push(...this.discoverClaude(claudeProjectsDir));
    out.push(...this.discoverCodex(codexSessionsDir));
    return out;
  }

  private discoverClaude(projectsDir: string): SessionDescriptor[] {
    const out: SessionDescriptor[] = [];
    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(projectsDir);
    } catch {
      return out;
    }

    for (const projectName of projectDirs) {
      const projectPath = path.join(projectsDir, projectName);
      try {
        if (!fs.statSync(projectPath).isDirectory()) continue;
      } catch {
        continue;
      }
      let entries: string[];
      try {
        entries = fs.readdirSync(projectPath);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith('.jsonl')) continue;
        const sid = entry.slice(0, -6);
        if (!UUID_RE.test(sid)) continue;
        const mainFile = path.join(projectPath, entry);

        const subagentDir = path.join(projectPath, sid, 'subagents');
        const subagentFiles: string[] = [];
        try {
          for (const sf of fs.readdirSync(subagentDir)) {
            if (sf.endsWith('.jsonl')) {
              subagentFiles.push(path.join(subagentDir, sf));
            }
          }
        } catch {
          // no subagent dir
        }

        // 性能優先: project dir 名から導出する (先頭 "-" を剥がした文字列をそのまま使う)。
        // JSONL 中の `cwd` フィールドから worktree を正規化した正確な repoName を得たい場合は、
        // 下流の SessionImporter (Step 2b 予定) で `extractRepoNameFromJsonl(mainFile)` を呼び直す。
        // Step 2a の Ingester は ~/.claude/projects を fast-scan するためにファイル本体を開かない。
        const derived = projectName.replace(/^-+/, '');
        out.push({
          sessionId: sid,
          mainFile,
          subagentFiles,
          repoName: derived,
          source: 'claude_code',
        });
      }
    }
    return out;
  }

  private discoverCodex(codexSessionsDir: string): SessionDescriptor[] {
    const out: SessionDescriptor[] = [];
    const files = collectRolloutJsonlFiles(codexSessionsDir);
    for (const filePath of files) {
      const sidMatch =
        /([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\.jsonl$/i.exec(filePath);
      const sid = sidMatch?.[1] ?? path.basename(filePath, '.jsonl');

      if (this.opts.gitRoot) {
        const meta = readCodexSessionCwd(filePath);
        if (!meta) continue;
        const normalizedCwd = path.resolve(meta);
        const normalizedGitRoot = path.resolve(this.opts.gitRoot);
        if (!normalizedCwd.startsWith(normalizedGitRoot)) continue;
      }

      out.push({
        sessionId: sid,
        mainFile: filePath,
        subagentFiles: [],
        repoName: this.opts.repoName || 'codex',
        source: 'codex',
      });
    }
    return out;
  }
}

function collectRolloutJsonlFiles(rootDir: string): string[] {
  const results: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (
        entry.isFile() &&
        entry.name.startsWith('rollout-') &&
        entry.name.endsWith('.jsonl')
      ) {
        results.push(full);
      }
    }
  }
  return results;
}

function readCodexSessionCwd(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let rec: unknown;
      try {
        rec = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!rec || typeof rec !== 'object') continue;
      const r = rec as { type?: unknown; payload?: unknown };
      if (r.type !== 'session_meta' || !r.payload || typeof r.payload !== 'object') continue;
      const cwd = (r.payload as Record<string, unknown>).cwd;
      return typeof cwd === 'string' ? cwd : null;
    }
    return null;
  } catch {
    return null;
  }
}
