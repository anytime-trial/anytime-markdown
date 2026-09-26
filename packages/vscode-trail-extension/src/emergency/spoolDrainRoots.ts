// spool drain の対象ディレクトリ解決（stopHookSpoolDrain / emergencySpoolDrain 共通）。
//
// フック（bash）は `git -C <cwd> rev-parse --git-common-dir` で書き先を決めるのに対し、
// 拡張は `anytimeTrail.workspace.path`（設定値）1 つだけを解決していた。設定値が存在しない
// ディレクトリを指すと resolveAirspaceDir が null を返し、drain は fail-open で黙って 0 件を
// 返し続ける（2026-08-29〜09-26 の 29 日間、608 行が未消化のまま残った。T-32）。
// 候補（設定値・workspaceFolders・lep.json の gitRoots）を全部解決し、git-common-dir 単位で
// 重複排除する。解決できないパスは 1 回だけ警告する（60 秒周期のスパムを避けつつ沈黙させない）。
import { resolveAirspaceDir } from '@anytime-markdown/agent-core';

const warnedPaths = new Set<string>();

/** テスト用: 警告の重複抑止をリセットする。 */
export function resetSpoolDrainRootWarnings(): void {
  warnedPaths.clear();
}

/**
 * 候補パスを airspace dir（`<git-common-dir>/anytime`）の集合へ解決する。
 * 空文字・重複・非 git は除き、非 git は初回のみ warn へ通知する。
 */
export function resolveSpoolDrainDirs(
  candidates: readonly (string | undefined)[],
  warn: (message: string) => void = () => {},
): string[] {
  const dirs: string[] = [];
  const seenCandidates = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue;
    if (seenCandidates.has(candidate)) continue;
    seenCandidates.add(candidate);
    const dir = resolveAirspaceDir(candidate);
    if (dir === null) {
      if (!warnedPaths.has(candidate)) {
        warnedPaths.add(candidate);
        warn(
          `spool drain: ${candidate} を git リポジトリとして解決できないため drain 対象から外す（anytimeTrail.workspace.path / lep.json sources.gitRoots を確認）`,
        );
      }
      continue;
    }
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}
