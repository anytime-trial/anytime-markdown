// domain/model/commitPrefix.ts — Conventional Commits prefix extraction

/**
 * コミット subject の先頭から Conventional Commits プレフィクスを抽出する。
 * scope `(xxx)` と `!`（breaking change マーカー）は許容。
 * マッチしない場合は `'other'` を返す。
 *
 * 例:
 *   - `feat: add X` → `feat`
 *   - `fix(scope): ...` → `fix`
 *   - `refactor!: ...` → `refactor`
 *   - `Merge branch ...` → `merge` （先頭が単語＋`:`→` の形に合致しないので `other`）
 *   - `release: v1.2.3` → `release`
 */
export function extractCommitPrefix(subject: string): string {
  const match = /^([a-z]+)(?:\([^)]*\))?!?:\s/i.exec(subject);
  return match ? match[1].toLowerCase() : 'other';
}
