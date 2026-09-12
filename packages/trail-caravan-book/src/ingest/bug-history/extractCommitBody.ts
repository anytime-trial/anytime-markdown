/**
 * fix コミット本文（件名以降）の抽出（spec memory-core §6.7）。
 *
 * コミット本文は規約上「採った方針・却下した代替案・想定される失敗シナリオ」を
 * 記す場所（Why の正本）であり、因果カード（§7.6）の `why` の供給源になる。
 * 件名 1 行目と git trailer 行を除いた本文を、上限付きで返す。
 */

export const BODY_EXCERPT_MAX_CHARS = 2000;

/** 行頭が `<既知トレーラー>:` の形をした行だけを落とす（本文中の言及は残す） */
const TRAILER_LINE = /^(co-authored-by|signed-off-by|reviewed-by|acked-by|tested-by):\s/i;

/**
 * 先頭・末尾の改行を落とす。/^\n+/ と /\n+$/ は一致しない入力で改行連長ぶん
 * バックトラックする（Sonar S8786: super-linear backtracking）。
 */
function trimNewlines(value: string): string {
  let start = 0;
  while (start < value.length && value[start] === '\n') start += 1;
  let end = value.length;
  while (end > start && value[end - 1] === '\n') end -= 1;
  return value.slice(start, end);
}

export function extractCommitBody(commitMessage: string): string {
  const lines = commitMessage.replaceAll('\r\n', '\n').split('\n');
  const body = trimNewlines(
    lines
      .slice(1)
      .filter((line) => !TRAILER_LINE.test(line))
      .join('\n'),
  );
  if (body.length > BODY_EXCERPT_MAX_CHARS) {
    return `${body.slice(0, BODY_EXCERPT_MAX_CHARS)}…`;
  }
  return body;
}
