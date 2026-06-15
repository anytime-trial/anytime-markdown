/**
 * 本文中の標準 markdown リンク（`[text](target.md)`）から `.md` 参照を抽出する
 * 純粋関数。Obsidian の `[[...]]` ではなく GFM リンクが本コーパスの一次リンク源。
 *
 * - 画像 `![...]()` は除外
 * - フェンス/インラインコード内のリンクは無視
 * - `#anchor` / `?query` / `"title"` / `<...>` を除去し URL デコードする
 * - 解決（ファイル相対 / root 相対）は呼び出し側（scan）が既知ノード集合で行う
 */

const FENCED_CODE_RE = /(^|\n)(```|~~~)[\s\S]*?\n\2[ \t]*(?=\n|$)/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
// 画像でない（直前が `!` でない）markdown リンク。target をキャプチャ。
const LINK_RE = /(!?)\[[^\]]*\]\(([^)]+)\)/g;

/** target からアンカー・クエリ・タイトル・角括弧を除去し URL デコードする。 */
function cleanTarget(raw: string): string | null {
  let t = raw.trim();
  if (t.startsWith('<') && t.includes('>')) {
    t = t.slice(1, t.indexOf('>'));
  } else {
    // `url "title"` / `url 'title'` のタイトル部を落とす
    const space = t.search(/\s/);
    if (space !== -1) t = t.slice(0, space);
  }
  // クエリ・アンカーを除去
  t = t.replace(/[?#].*$/, '');
  if (!t) return null;
  try {
    t = decodeURIComponent(t);
  } catch {
    // 不正な % エンコードはそのまま扱う（リンク自体は有効なことがある）
  }
  return t;
}

function isMarkdownTarget(t: string): boolean {
  const lower = t.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/**
 * 本文から `.md` を指す markdown リンクの target 一覧（記述そのまま・重複排除）を返す。
 */
export function extractBodyLinks(content: string): string[] {
  const stripped = content.replace(FENCED_CODE_RE, '\n').replace(INLINE_CODE_RE, ' ');
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(stripped)) !== null) {
    if (m[1] === '!') continue; // 画像は除外
    const target = cleanTarget(m[2]);
    if (!target || !isMarkdownTarget(target)) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}
