import path from 'node:path';
import type { AgentSource, MappingState, SessionMapping, WorktreeEntry, WorktreeMapping } from './types';

// ---------------------------------------------------------------------------
// Local AgentInfo-compatible type (trail-core has no dependency on vscode-common)
// ---------------------------------------------------------------------------

interface AgentInfoLike {
  readonly sessionId: string;
  readonly source: AgentSource;
  readonly editing: boolean;
  readonly file: string;
  readonly timestamp: string;
  readonly branch: string;
  readonly sessionEdits: readonly { file: string; timestamp: string }[];
  readonly plannedEdits: readonly string[];
  readonly sessionTitle?: string;
  readonly workspacePath?: string;
  readonly contextTokens?: number;
  readonly committedCount?: number;
  readonly lastCommit?: { hash: string; timestamp: string };
}

// ---------------------------------------------------------------------------
// classifySession
// ---------------------------------------------------------------------------

interface ClassifyOptions {
  activeThresholdSec?: number;
  recentThresholdSec?: number;
}

export function classifySession(
  timestamp: string,
  now: Date = new Date(),
  options: ClassifyOptions = {}
): MappingState {
  const { activeThresholdSec = 300, recentThresholdSec = 3600 } = options;
  const ageSeconds = (now.getTime() - new Date(timestamp).getTime()) / 1000;
  if (ageSeconds <= activeThresholdSec) {
    return 'active';
  }
  if (ageSeconds <= recentThresholdSec) {
    return 'recent';
  }
  return 'stale';
}

// ---------------------------------------------------------------------------
// resolveWorktree
// ---------------------------------------------------------------------------

export function resolveWorktree(
  file: string,
  branch: string,
  worktrees: readonly WorktreeEntry[],
  workspacePath?: string,
  sessionEdits?: readonly { file: string; timestamp: string }[]
): WorktreeEntry | null {
  // パス文字列から最長一致のworktreeを返すヘルパー
  function matchByPath(p: string): WorktreeEntry | null {
    if (!p) return null;
    let best: WorktreeEntry | null = null;
    for (const wt of worktrees) {
      const prefix = wt.path.endsWith('/') ? wt.path : `${wt.path}/`;
      if (p.startsWith(prefix) || p === wt.path) {
        if (best === null || wt.path.length > best.path.length) {
          best = wt;
        }
      }
    }
    return best;
  }

  // 0. workspacePath prefix match（Bash のみのセッション: テスト実行中など）
  if (workspacePath) {
    const m = matchByPath(workspacePath);
    if (m !== null) return m;
  }

  // 1. 現在の file prefix match
  if (file) {
    const m = matchByPath(file);
    if (m !== null) return m;
    // file が非空でも一致しない場合はブランチ照合をスキップして sessionEdits へ。
    // ドキュメント編集など別リポジトリのファイルが最後に開かれているケースに対応。
  }

  // 2. sessionEdits の逆順スキャン（最新 → 最古）
  // コード変更後にdocs修正をした場合など、直近の worktree 内編集履歴を使って解決する。
  if (sessionEdits && sessionEdits.length > 0) {
    for (let i = sessionEdits.length - 1; i >= 0; i--) {
      const m = matchByPath(sessionEdits[i].file);
      if (m !== null) return m;
    }
    // sessionEdits がすべて非一致（例: docs のみ編集）→ orphan
    return null;
  }

  // 3. file も sessionEdits も空のとき（セッション開始直後）のみ branch でフォールバック
  if (!file) {
    return worktrees.find((wt) => wt.branch === branch) ?? null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// buildAgentMapping
// ---------------------------------------------------------------------------

interface BuildOptions {
  now?: Date;
  activeThresholdSec?: number;
  recentThresholdSec?: number;
}

const STATE_PRIORITY: Record<MappingState, number> = {
  active: 2,
  recent: 1,
  stale: 0,
};

function aggregateState(states: readonly MappingState[]): MappingState {
  if (states.length === 0) {
    return 'stale';
  }
  return states.reduce<MappingState>(
    (best, s) => (STATE_PRIORITY[s] > STATE_PRIORITY[best] ? s : best),
    states[0]
  );
}

/** どの worktree にも解決できなかったセッション（＝別ワークスペースのセッション）を束ねる仮想 worktree のパス。 */
export const ORPHAN_WORKTREE_PATH = '(orphan)';

/**
 * セッションが動作しているワークスペースのパスを決める。
 * 解決済み worktree を優先する（Codex の cwd は worktree のサブディレクトリであり得るため worktree ルートへ正規化される）。
 * orphan（現リポジトリのどの worktree にも属さない＝別ワークスペースのセッション）はセッション自身の workspacePath を使う。
 * どちらも得られない場合は空文字を返す。
 *
 * SHORTCUT: orphan は workspacePath（Codex は起動時 cwd）をそのままキーにする.
 * ceiling: 現リポジトリの worktree 一覧しか持たないため外部リポジトリのルートを判定できず、
 * 同一の外部リポジトリでもサブディレクトリから起動したセッションは別ワークスペースとして分かれる.
 * upgrade: 外部リポジトリのルートを解決する手段（cwd から上位の .git 探索など）を入れたらそこへ丸める.
 */
export function resolveSessionWorkspacePath(worktreePath: string, workspacePath?: string): string {
  if (worktreePath && worktreePath !== ORPHAN_WORKTREE_PATH) {
    return worktreePath;
  }
  return workspacePath ?? '';
}

/** ワークスペース単位にまとめた 1 群。 */
export interface WorkspaceGroup<T> {
  readonly workspacePath: string;
  readonly items: readonly T[];
}

/**
 * セッションをワークスペース単位にまとめる。
 * キーはフルパス（basename ではない）。同名の worktree（例: 別リポジトリ配下の同名ブランチ）を
 * 1 つの群に潰さないため。
 * 群の並びは各群の最小 age（＝最新アクティビティ）昇順。群内は入力順を保つ。
 */
export function groupByWorkspace<T>(
  items: readonly T[],
  workspacePathOf: (item: T) => string,
  ageSecondsOf: (item: T) => number
): readonly WorkspaceGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = workspacePathOf(item);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [item]);
    } else {
      bucket.push(item);
    }
  }

  return [...buckets.entries()]
    .map(([workspacePath, groupItems]) => ({
      workspacePath,
      items: groupItems,
      minAge: groupItems.reduce((min, i) => Math.min(min, ageSecondsOf(i)), Infinity),
    }))
    .sort((a, b) => a.minAge - b.minAge)
    .map(({ workspacePath, items: groupItems }) => ({ workspacePath, items: groupItems }));
}

function worktreeName(wt: WorktreeEntry): string {
  if (wt.isMain) {
    return '(main)';
  }
  return path.basename(wt.path);
}

export function buildAgentMapping(
  agents: readonly AgentInfoLike[],
  worktrees: readonly WorktreeEntry[],
  options: BuildOptions = {}
): readonly WorktreeMapping[] {
  const { now = new Date(), activeThresholdSec, recentThresholdSec } = options;

  const classifyOpts: ClassifyOptions = {};
  if (activeThresholdSec !== undefined) {
    classifyOpts.activeThresholdSec = activeThresholdSec;
  }
  if (recentThresholdSec !== undefined) {
    classifyOpts.recentThresholdSec = recentThresholdSec;
  }

  // Map worktree path → session list
  const wtSessions = new Map<string, SessionMapping[]>();
  const orphanSessions: SessionMapping[] = [];

  for (const agent of agents) {
    const state = classifySession(agent.timestamp, now, classifyOpts);
    const ageSeconds = (now.getTime() - new Date(agent.timestamp).getTime()) / 1000;
    const session: SessionMapping = {
      sessionId: agent.sessionId,
      source: agent.source,
      state,
      editing: agent.editing,
      file: agent.file,
      fileBasename: agent.file ? path.basename(agent.file) : '',
      timestamp: agent.timestamp,
      ageSeconds,
      sessionEdits: agent.sessionEdits,
      plannedEdits: agent.plannedEdits,
      sessionTitle: agent.sessionTitle,
      workspacePath: agent.workspacePath,
      contextTokens: agent.contextTokens,
      committedCount: agent.committedCount,
      lastCommit: agent.lastCommit,
    };

    const resolved = resolveWorktree(
      agent.file, agent.branch, worktrees, agent.workspacePath, agent.sessionEdits
    );
    if (resolved === null) {
      orphanSessions.push(session);
    } else {
      const key = resolved.path;
      const existing = wtSessions.get(key);
      if (existing === undefined) {
        wtSessions.set(key, [session]);
      } else {
        existing.push(session);
      }
    }
  }

  const result: WorktreeMapping[] = [];

  // すべての worktree をセッションの有無に関わらず含める
  for (const wt of worktrees) {
    const sessions = wtSessions.get(wt.path) ?? [];
    const states = sessions.map((s) => s.state);
    result.push({
      worktreePath: wt.path,
      worktreeName: worktreeName(wt),
      isMain: wt.isMain,
      branch: wt.branch,
      sessions,
      aggregatedState: aggregateState(states),
      activeCount: sessions.filter((s) => s.state === 'active').length,
    });
  }

  // Orphan group (only if non-empty)
  if (orphanSessions.length > 0) {
    const states = orphanSessions.map((s) => s.state);
    result.push({
      worktreePath: ORPHAN_WORKTREE_PATH,
      worktreeName: ORPHAN_WORKTREE_PATH,
      isMain: false,
      branch: ORPHAN_WORKTREE_PATH,
      sessions: orphanSessions,
      aggregatedState: aggregateState(states),
      activeCount: orphanSessions.filter((s) => s.state === 'active').length,
    });
  }

  return result;
}
