import path from 'node:path';

/**
 * analyze-exclude ファイルの格納ディレクトリ（workspace ルートからの相対セグメント）。
 * trail ランタイム設定（`lep.json` / `db` / `config.json`）と同じ `.anytime/trail/` 配下に集約する。
 */
export const ANALYZE_EXCLUDE_DIR_SEGMENTS = ['.anytime', 'trail'] as const;

/** analyze-exclude のファイル名。 */
export const ANALYZE_EXCLUDE_FILE_NAME = 'analyze-exclude';

/** `<root>/.anytime/trail` の絶対パスを返す（seed 時の mkdir 対象）。 */
export function analyzeExcludeDir(root: string): string {
  return path.join(root, ...ANALYZE_EXCLUDE_DIR_SEGMENTS);
}

/** `<root>/.anytime/trail/analyze-exclude` の絶対パスを返す。 */
export function analyzeExcludeFilePath(root: string): string {
  return path.join(analyzeExcludeDir(root), ANALYZE_EXCLUDE_FILE_NAME);
}
