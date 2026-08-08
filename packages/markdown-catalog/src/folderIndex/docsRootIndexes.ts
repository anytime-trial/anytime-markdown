/**
 * docsRoot 全体のフォルダ索引再生成と、ingest 後に索引を続けて生成するオーケストレーション。
 *
 * 対象スコープ（type フォルダとタイトル表示名）はルート package.json の
 * spec:index / tech:index / proposal:index / review:index / report:index と同じ集合。
 * npm script 経路と拡張機能経路が同じ対象を再生成するよう、対応表はここを単一の正とする。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  generateDocIndexes,
  type GenerateDocIndexesResult,
} from './generateDocIndexes';

/** 索引を生成する docsRoot 直下の type フォルダと表示名。 */
export const DOC_INDEX_SCOPES: readonly { readonly dir: string; readonly label: string }[] = [
  { dir: 'spec', label: '設計書' },
  { dir: 'tech', label: '技術ドキュメント' },
  { dir: 'proposal', label: '提案' },
  { dir: 'review', label: 'レビュー' },
  { dir: 'report', label: 'レポート' },
];

export interface DocsRootIndexesOptions {
  readonly docsRoot: string;
  readonly lang?: string;
  readonly onWarn?: (message: string) => void;
}

/**
 * docsRoot 直下の既知 type フォルダすべての索引を再生成する（存在しないフォルダは飛ばす）。
 *
 * @throws docsRoot 自体が存在しない場合
 */
export function generateDocsRootIndexes(
  options: DocsRootIndexesOptions,
): GenerateDocIndexesResult {
  const { docsRoot, lang = 'ja', onWarn } = options;
  if (!fs.existsSync(docsRoot)) {
    throw new Error(`[doc-index] docsRoot not found: ${docsRoot}`);
  }
  let written = 0;
  let unchanged = 0;
  for (const scope of DOC_INDEX_SCOPES) {
    const dir = path.join(docsRoot, scope.dir);
    if (!fs.existsSync(dir)) continue;
    const r = generateDocIndexes({ docDir: dir, scopeLabel: scope.label, lang, onWarn });
    written += r.written;
    unchanged += r.unchanged;
  }
  return { written, unchanged, folders: written + unchanged };
}

export interface IngestThenIndexResult<T> {
  /** ingest の結果（runIngest の返り値そのまま） */
  readonly ingest: T;
  /** 索引再生成の結果。失敗時は undefined で error 側に理由が入る */
  readonly docIndexes?: GenerateDocIndexesResult;
  /** 索引再生成の失敗理由。ingest の成功は取り消さない */
  readonly docIndexesError?: string;
}

/**
 * ingest 成功後に索引を再生成する。
 *
 * - ingest が失敗（throw）したら索引再生成は行わない（不完全な入力で索引を上書きしない）
 * - 索引再生成の失敗は ingest の成功を取り消さず、`docIndexesError` として返す
 */
export async function ingestThenIndex<T>(options: {
  readonly runIngest: () => Promise<T>;
  readonly docsRoot: string;
  readonly lang?: string;
  readonly onWarn?: (message: string) => void;
}): Promise<IngestThenIndexResult<T>> {
  const ingest = await options.runIngest();
  try {
    const docIndexes = generateDocsRootIndexes({
      docsRoot: options.docsRoot,
      lang: options.lang,
      onWarn: options.onWarn,
    });
    return { ingest, docIndexes };
  } catch (err) {
    return { ingest, docIndexesError: err instanceof Error ? err.message : String(err) };
  }
}
