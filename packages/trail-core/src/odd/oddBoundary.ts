import * as path from 'node:path';
import type { OddRegistry } from './types';

export type OddBoundaryReason = 'odd_unknown' | 'restricted_area' | 'odd_out';

/**
 * レジストリの設定にかかわらず常に制限領域として扱うパス断片。
 *
 * **ODD レジストリ自身が最重要の対象である。** レジストリは承認境界を決める
 * 制御プレーンであり、これを代行で書き換えられると、以降のあらゆる制限を
 * 自分で外せてしまう。ユーザー設定に依存する `registry.restricted` に任せず、
 * 判定側の固定ルールとして持つ。
 */
export const ALWAYS_RESTRICTED_PATTERNS: readonly string[] = [
  '/.anytime/trail/odd.json',
];

function isWithin(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * ODD 境界の判定（全体要件 §3.2 / DCT-12）。制限領域は ODD 内であっても対象外の
 * ため、対象リポジトリ内かどうかより先に判定する。
 *
 * カバレッジゲート（代行可否）と承認ルールエンジン（操作可否）の両方が本関数を
 * 使う。境界の解釈が 2 箇所に分かれると、片方だけ緩い経路ができる。
 */
export function evaluateOddBoundary(
  registry: OddRegistry,
  targetPaths: readonly string[] | undefined,
): OddBoundaryReason | null {
  // 空文字列は path.resolve が cwd（＝ワークスペース内）へ解決し境界をすり抜ける
  // ため、申告の欠落として扱う
  if (
    targetPaths === undefined ||
    targetPaths.length === 0 ||
    targetPaths.some((target) => target.trim() === '')
  ) {
    return 'odd_unknown';
  }
  // 前方一致の前に正規化する。`..` を含むパスをそのまま比較すると境界をすり抜ける
  const normalized = targetPaths.map((target) => path.resolve(target));
  const restricted = normalized.some(
    (target) =>
      ALWAYS_RESTRICTED_PATTERNS.some((pattern) => target.includes(pattern)) ||
      registry.restricted.some((entry) =>
        entry.kind === 'prefix' ? isWithin(target, entry.value) : target.includes(entry.value),
      ),
  );
  if (restricted) {
    return 'restricted_area';
  }
  if (normalized.some((target) => !registry.roots.some((root) => isWithin(target, root)))) {
    return 'odd_out';
  }
  return null;
}
