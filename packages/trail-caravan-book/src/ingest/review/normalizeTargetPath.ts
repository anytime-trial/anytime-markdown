/**
 * レビュー指摘の対象パス正規化（純粋関数・DB 非依存）。
 *
 * ingest 3 経路（review_doc / session / agent）はいずれもこの関数を通す。
 * 経路ごとに正規化を書くと、片方だけ直して片方に異常値が残り続ける
 * （実データ 1,094 行のうち 4 類型の異常値がそれで蓄積していた）。
 *
 * 「解決できないものは null にする」方針を採り、推測で当てにいかない。
 * ここで生き残った値は `resolveTargetRepo` がリポジトリ実在性まで検査する。
 */

/**
 * `unknown` は「拡張子の有無ではファイルかディレクトリか決められない」形。
 *
 * この monorepo は連番＋ドットのディレクトリ名（`spec/92.doctrine`）と拡張子なしの
 * 実行ファイル（`scripts/ticket-hooks/post-commit`）の双方を常用しており、
 * 拡張子ヒューリスティックだけで二分すると、どちらも必ず 0 件になる述語へ落ちる。
 * 判定は推測せず DB の実在に委ねる（`resolveTargetRepo` が両方式で照合する）。
 */
export type TargetPathKind = 'file' | 'directory' | 'unknown';

/**
 * 実在が確実な拡張子の交替パターン（単一の正）。
 *
 * 抽出器（`findingHelpers.ts` の PATH_TOKEN_RE）も同じ集合を使う。かつては両者が
 * 別々のリストを持っており、`py` / `sh` / `rs` / `go` / `toml` が抽出器側にだけ
 * 無かった。結果は「正規化は通るのに抽出器が拾わない」非対称で、症状は
 * 「対象パスが空の指摘」に紛れて異常として現れない。リストは 1 箇所に置く。
 */
export const KNOWN_FILE_EXT_SOURCE =
  'tsx?|jsx?|mts|cts|mjs|cjs|md|sql|jsonc|json|ya?ml|css|scss|html?|txt|sh|py|rs|go|toml|lock|svg|png|jpe?g|gif|ico|vsix';

/** 実在が確実な拡張子（これらは常にファイルとして扱ってよい）。 */
const KNOWN_FILE_EXT_RE = new RegExp(String.raw`\.(?:${KNOWN_FILE_EXT_SOURCE})$`, 'i');

export interface NormalizedTargetPath {
  readonly path: string;
  readonly kind: TargetPathKind;
  /**
   * 絶対パス（`/anytime-trade/docs/x.md` 等）か。
   *
   * 先頭の `/` を剥がしてリポジトリ相対に見せかけてはならない。絶対パスは
   * **どのワークスペースの資産かを唯一特定できる情報**であり、剥がすと
   * `Shared/anytime-markdown-docs/...` のような実在しないパスに化ける
   * （実データ 4 件でこの化けを検出した）。どのリポジトリへ属させるかの解決は
   * ワークスペース構成を知る `resolveTargetRepo` の責務。
   */
  readonly absolute: boolean;
}

/** 実運用のパス長上限。これを超える入力はパスでなく本文の誤抽出とみなす。 */
const MAX_PATH_LENGTH = 255;

/**
 * 行番号サフィックス。`:24` / `:24-48` / `:24, 48, 49` の 3 形を落とす。
 * カンマ列は実データにあり（`i18n.test.ts:24, 48, 49`）、旧 stripLineSuffix は
 * `/:\d+(?:-\d+)?$/` だったため丸ごと残していた。
 */
const LINE_SUFFIX_RE = /:\d+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*$/;

/** ドットを含む最終セグメント。既知拡張子でなければ `unknown` に倒す。 */
const DOTTED_TAIL_RE = /\.[A-Za-z0-9]+$/;

/** 囲み文字（バッククォート・引用符）を 1 重だけ剥がす。 */
function stripEnclosing(value: string): string {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['`', '`'],
    ['"', '"'],
    ["'", "'"],
  ];
  for (const [open, close] of pairs) {
    if (value.length >= 2 && value.startsWith(open) && value.endsWith(close)) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}

/**
 * 表層のノイズ（囲み文字・行番号サフィックス・`./` 前置・末尾スラッシュ）を落とし、
 * そもそもパスの形をしていない入力（複数行・空白入り・URL）を弾く。
 * 判定順序は元の実装のまま保つ（空白判定より先に行番号を落とす等の依存がある）。
 */
function sanitizeCandidate(raw: string): string | null {
  // 複数行はパスではない（バッククォート内のシェル実行ログ全体を積んだ誤抽出）。
  if (raw.includes('\n') || raw.includes('\r')) return null;

  let value = stripEnclosing(raw.trim());
  if (value === '') return null;

  // 空白判定より先に行番号サフィックスを落とす（`x.ts:24, 48, 49` は空白を含むため）。
  value = value.replace(LINE_SUFFIX_RE, '').trim();
  if (value === '') return null;

  // この monorepo のパスに空白は現れない。空白を含むものはコマンド行・文章の誤抽出。
  if (/\s/.test(value)) return null;

  // URL は拒否する。GitHub の blob URL はブランチ名にスラッシュを含み得るため、
  // ref とリポジトリ相対パスの境界を機械的に確定できない（推測すると誤ったパスを作る）。
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return null;

  value = value.replace(/^\.\//, '').replace(/\/+$/, '');
  if (value === '') return null;

  return value;
}

/** 正規化済みの値がパスとして受理できるか（長さ・相対参照・glob・先頭ハイフン・セグメント形）。 */
function isAcceptablePath(value: string): boolean {
  if (value.length > MAX_PATH_LENGTH) return false;
  if (
    value
      .split('/')
      .some((segment, index) => segment === '..' || (segment === '.' && index > 0))
  ) {
    return false;
  }
  if (/[*?[\]]/.test(value)) return false;
  if (value.startsWith('-')) return false;

  // ディレクトリ区切りも拡張子も持たない単語（`node` / `レビュー対象`）はパスではない。
  const hasSeparator = value.includes('/');
  const dotted = DOTTED_TAIL_RE.test(value);
  if (!hasSeparator && !dotted) return false;

  return true;
}

export function normalizeTargetPath(raw: string | null | undefined): NormalizedTargetPath | null {
  if (raw == null) return null;

  const sanitized = sanitizeCandidate(raw);
  if (sanitized === null) return null;

  // 絶対パスは先頭 1 個の `/` だけ残して保持する（剥がさない。上の absolute の注記を参照）。
  let value = sanitized;
  const absolute = value.startsWith('/');
  if (absolute) {
    value = `/${value.replace(/^\/+/, '')}`;
    if (value === '/') return null;
  }

  if (!isAcceptablePath(value)) return null;

  // 既知拡張子ならファイル確定。ドットは在るが既知拡張子でない（`spec/92.doctrine`）、
  // またはドットが無い（`scripts/post-commit` / `packages/markdown-viewer`）ものは
  // 断定できないので `unknown` にして、照合側で両方式を試させる。
  const kind: TargetPathKind = KNOWN_FILE_EXT_RE.test(value) ? 'file' : 'unknown';

  return { path: value, kind, absolute };
}
