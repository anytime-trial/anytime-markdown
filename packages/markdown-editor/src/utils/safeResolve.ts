import type { Node as PMNode, ResolvedPos } from "@anytime-markdown/markdown-pm/model";

/**
 * ProseMirror の `doc.resolve(pos)` / `doc.nodeAt(pos)` は範囲外・無効な pos に対して
 * `RangeError` を投げる。テーブルセル操作・画像ドラッグ等でマッピング後の pos が
 * ドキュメント変更により壊れているケースは握りつぶさず、コンテキスト（呼び出し元タグ・pos）を
 * ログに残しつつ null にフォールバックする共通ヘルパ（silent catch 禁止規約対応）。
 *
 * 範囲外アクセスはドラッグ中・セル境界操作等の通常操作でも発生し得るため、
 * 同一タグの warn はプロセス内で初回のみに抑制する（ログスパム防止）。
 */
const warnedTags = new Set<string>();

function warnOnce(tag: string, pos: number, error: unknown): void {
  if (warnedTags.has(tag)) return;
  warnedTags.add(tag);
  console.warn(
    `[safeResolve:${tag}] pos=${pos} の解決に失敗しました（以降同一タグの warn は抑制）`,
    error,
  );
}

/** テスト専用: warn 抑制状態をリセットする */
export function resetSafeResolveWarnState(): void {
  warnedTags.clear();
}

/** `doc.resolve(pos)` の安全版。失敗時は null を返し、tag/pos 付きで warn する */
export function safeResolve(doc: PMNode, pos: number, tag: string): ResolvedPos | null {
  try {
    return doc.resolve(pos);
  } catch (error) {
    warnOnce(tag, pos, error);
    return null;
  }
}

/** `doc.nodeAt(pos)` の安全版。失敗時は null を返し、tag/pos 付きで warn する */
export function safeNodeAt(doc: PMNode, pos: number, tag: string): PMNode | null {
  try {
    return doc.nodeAt(pos) ?? null;
  } catch (error) {
    warnOnce(tag, pos, error);
    return null;
  }
}
