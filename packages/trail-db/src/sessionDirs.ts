/**
 * ディスク上のセッション JSONL を走査して、取り込み対象の一覧を組み立てる。
 *
 * `TrailDatabase.importAll` から切り出した（`this` を使わないため純粋関数として扱える）。
 * 走査の取りこぼしは「セッションが数件少ない」という静かな形でしか現れないため、
 * 単体で特性化テストを書けるようにここへ分けている。
 */
import fs from 'node:fs';
import path from 'node:path';

import { extractRepoNameFromJsonl } from './sessionMeta';

/** importAll が扱うセッション単位の入力（main JSONL + subagent JSONL 群）。 */
export interface ImportAllSessionDir {
  sid: string;
  mainFile: string;
  subagentFiles: string[];
  repoName: string;
  source: 'claude_code' | 'codex';
}

/**
 * セッションに隣接する `<sid>/subagents/` 配下の JSONL を集める。
 * ディレクトリが無いセッション（サブエージェントを使っていない）が普通なので、
 * 読めない場合は空配列を返す。
 */
function collectSubagentJsonlFiles(subagentDir: string): string[] {
  const subagentFiles: string[] = [];
  try {
    for (const sf of fs.readdirSync(subagentDir)) {
      if (sf.endsWith('.jsonl')) subagentFiles.push(path.join(subagentDir, sf));
    }
  } catch { /* no subagents dir */ }
  return subagentFiles;
}

/**
 * プロジェクトディレクトリ 1 件分のセッションを集める。
 * ディレクトリでない / 読めない場合は空配列（そのプロジェクトを飛ばす）。
 */
function collectSessionDirsInProject(
  projectPath: string,
  projectName: string,
  uuidPattern: RegExp,
): ImportAllSessionDir[] {
  try {
    if (!fs.statSync(projectPath).isDirectory()) return [];
  } catch { return []; }

  let entries: string[];
  try { entries = fs.readdirSync(projectPath); } catch { return []; }

  const sessionDirs: ImportAllSessionDir[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    const sid = entry.slice(0, -6);
    if (!uuidPattern.test(sid)) continue;
    const mainFile = path.join(projectPath, entry);
    const subagentFiles = collectSubagentJsonlFiles(path.join(projectPath, sid, 'subagents'));
    const derivedRepoName = extractRepoNameFromJsonl(mainFile) ?? projectName.replace(/^-+/, '');
    sessionDirs.push({ sid, mainFile, subagentFiles, repoName: derivedRepoName, source: 'claude_code' });
  }
  return sessionDirs;
}

/**
 * Claude Code の projects ディレクトリからセッション一覧を組み立てる。
 *
 * repo 名は JSONL の中身（cwd）から導き、取れなければディレクトリ名の先頭ハイフンを
 * 落としたものを使う。
 */
export function collectClaudeCodeSessionDirs(
  projectDirs: readonly string[],
  projectsDir: string,
  uuidPattern: RegExp,
): ImportAllSessionDir[] {
  const sessionDirs: ImportAllSessionDir[] = [];
  for (const projectName of projectDirs) {
    const projectPath = path.join(projectsDir, projectName);
    sessionDirs.push(...collectSessionDirsInProject(projectPath, projectName, uuidPattern));
  }
  return sessionDirs;
}
