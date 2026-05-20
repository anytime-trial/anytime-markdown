import * as fs from 'node:fs';

const WORKTREE_SEGMENTS = new Set(['.worktrees', '.claude-worktrees']);

function deriveRepoNameFromCwd(cwd: string): string | null {
  const trimmed = cwd.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return null;

  const segments = trimmed.split('/').filter((s) => s !== '');
  if (segments.length === 0) return null;

  // worktree 直下 (.worktrees/<name> or .claude-worktrees/<name>) は親 repo に正規化する
  for (let i = segments.length - 1; i >= 1; i--) {
    if (WORKTREE_SEGMENTS.has(segments[i] ?? '')) {
      return segments[i - 1] ?? null;
    }
  }

  return segments.at(-1) ?? null;
}

/**
 * JSONL から最初に見つかった `cwd` フィールドを取り、worktree を親 repo に正規化したうえで
 * basename を返す。取れない場合 null。
 *
 * 用途: TrailDatabase.importAll で sessions.repo_name を JSONL の本物の作業 cwd 由来に
 * stamp するため。詳細は plan/20260518-sessions-repo-name-from-cwd.ja.md 参照。
 */
export function extractRepoNameFromJsonl(filePath: string): string | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  for (const raw of lines) {
    if (raw.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const cwd = (parsed as { cwd?: unknown }).cwd;
    if (typeof cwd !== 'string') continue;
    const derived = deriveRepoNameFromCwd(cwd);
    if (derived !== null) return derived;
    // cwd はあるが basename を取れない (`/` 等) → 次の行を見る
  }
  return null;
}

// テストから直接検証したい場合に備えて export
export const __internal = { deriveRepoNameFromCwd };
