'use strict';
// shortcutMarkers.cjs — SHORTCUT 意図的簡略化マーカーの判定ロジック(単一の正)。
// 消費者: grounding.cjs(台帳・観測) と scripts/check-shortcut-markers.mjs(CI ゲート)。
// 両者の意味ズレを防ぐため判定はここに一本化する。スキルディレクトリに置くのは
// grounding が .vsix 同梱で単体配布されるため(scripts/ は配布物に含まれない)。
//
// 規約(~/.claude/rules/code-quality.md 2.1): マーカーは <内容>. ceiling: <上限>. upgrade: <契機>.
// の 3 要素必須。実運用ではコメント行の折り返しがあるため、マーカー行に続く連続コメント行
// (新たなマーカーを含まない)を 1 ブロックとして判定する。

// タグは分割構築(この判定モジュール自身が完全リテラルを含まず自己検出されないように)。
const TAG = 'SHORT' + 'CUT';
const MARKER_NEEDLE = `${TAG}:`;
// コメント接頭辞付きのみ採用(コード中の文字列リテラルを拾わない)。
const MARKER_RE = new RegExp(String.raw`(?:\/\/|\/\*|\*|#)\s*${MARKER_NEEDLE}`);
const COMMENT_LINE_RE = /^\s*(?:\/\/|\*|#)/;
const CEILING_RE = /\bceiling:/i;
const UPGRADE_RE = /\bupgrade:/i;

/**
 * テキスト内の SHORTCUT マーカーを列挙する(純粋関数)。
 * マーカー行と後続の連続コメント行(次のマーカーの手前まで)を 1 ブロックとして
 * ceiling / upgrade の有無を判定する。
 * @returns {{ line: number, hasCeiling: boolean, hasUpgrade: boolean }[]} line は 1-origin
 */
function collectShortcutMarkers(text) {
  if (!text.includes(MARKER_NEEDLE)) return [];
  const lines = text.split('\n');
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    if (!MARKER_RE.test(lines[i])) continue;
    let block = lines[i];
    for (let j = i + 1; j < lines.length && COMMENT_LINE_RE.test(lines[j]) && !MARKER_RE.test(lines[j]); j++) {
      block += '\n' + lines[j];
    }
    markers.push({ line: i + 1, hasCeiling: CEILING_RE.test(block), hasUpgrade: UPGRADE_RE.test(block) });
  }
  return markers;
}

module.exports = { collectShortcutMarkers, MARKER_NEEDLE };
