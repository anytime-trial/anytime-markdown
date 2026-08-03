import * as path from 'node:path';
import type { OddConfig } from './coverageGate';

export interface OddConfigInput {
  /** ワークスペースルート（対象リポジトリ） */
  readonly workspacePath: string;
  /** ユーザーのホームディレクトリ（永続データ領域の解決基準） */
  readonly homeDir: string;
  /** ファイル読取（不在は null）。テスト隔離のため注入する */
  readonly readFile: (path: string) => string | null;
}

/** docsRoot の単一の正はプロジェクト CLAUDE.md の `- docsRoot:` 行（preflight と同じ解決） */
const DOCS_ROOT_PATTERN = /^- docsRoot:\s*(\S+)\s*$/m;

/**
 * ODD 境界（全体要件 §3.2）を解決する。対象リポジトリのルートはハードコードせず、
 * ワークスペースと CLAUDE.md の docsRoot から導出する。
 *
 * SHORTCUT: ODD を CLAUDE.md 由来の 2 ルート + 固定の制限領域で表現する.
 * ceiling: 言語・FW 条件や リポジトリ横断の ODD は表現できない.
 * upgrade: Phase 7 の ODD Policy Registry (.anytime-trail/odd.yaml) を導入したら
 * 本関数の中身をその読み込みへ差し替える (差し替え点はこの 1 関数に閉じている).
 */
export function resolveOddConfig(input: OddConfigInput): OddConfig {
  const roots = [input.workspacePath];
  const claudeMd = input.readFile(path.join(input.workspacePath, 'CLAUDE.md'));
  const docsRoot = claudeMd === null ? null : DOCS_ROOT_PATTERN.exec(claudeMd);
  if (docsRoot !== null) {
    roots.push(docsRoot[1]);
  }
  return {
    roots,
    restrictedPrefixes: [
      path.join(input.homeDir, '.claude'),
      path.join(input.homeDir, '.config'),
      path.join(input.homeDir, '.local', 'share'),
    ],
    restrictedPatterns: ['/.github/workflows/', '/.env'],
  };
}
