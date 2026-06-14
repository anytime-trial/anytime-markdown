/**
 * ノート網ノードの入力型（拡張ホスト側のローカル定義）。
 *
 * graph-core の `NoteGraphDocInput` と構造的に一致させる。ホストは graph-core を
 * 直接参照せず（DOM 型の取り込みを避けるため）、webview 側で graph-core 型として扱う。
 */
export interface NoteDocInput {
  /** リポジトリルート相対の POSIX パス（ノード ID 兼参照キー）。 */
  path: string;
  /** 表示ラベル（frontmatter `title`）。 */
  title: string;
  /** ドキュメント種別（frontmatter `type`）。 */
  type?: string;
  /** グループ（frontmatter `category`）。 */
  category?: string;
  /** 明示リンク（frontmatter `related`・ルート相対パス）。 */
  related?: string[];
  /** 共有クラスタ用タグ（frontmatter `tags`）。 */
  tags?: string[];
  /** C4 アンカー（frontmatter `c4Scope`）。 */
  c4Scope?: string[];
}
