/**
 * 配色トークンの写しがずれていないか。
 *
 * `DIAGRAM_THEME_TOKENS` は `packages/markdown-editor/src/constants/colors.ts` からの値の写し
 * である（import すると barrel ごと配布バンドルへ入るため写しにしてある）。写しは**ずれても
 * 誰も気づかない**のが問題で、コメントに「一致しているのが目印」と書いてあっても人の目視は
 * 検査項目ではない。
 *
 * パッケージをまたぐ一致（colors.ts との照合）は import を避ける以上ここでは測れない。測れる
 * のは同じファイル内の 2 箇所 — `DIAGRAM_THEME_TOKENS.light` と `DIAGRAM_STYLES` の最後の
 * 既定値 — で、この 2 つは同じ水墨のライト一式を表している。片方だけを直した変更をここで
 * 止める。
 */

import { DIAGRAM_STYLES, DIAGRAM_THEME_TOKENS } from '../theme/diagramStyles';

/**
 * `--diagram-x: var(--am-…, var(--vscode-…, var(<鍵>, <既定>)));` の <既定> を引く。
 *
 * 括弧の数で切らない。既定値には `rgba(31, 30, 28, 0.12)` のように括弧を含むものが在り、
 * `[^)]+` で拾うとその 1 件だけが静かに `null` になる（実際にこの検査を書いたときに踏んだ）。
 * 宣言は 1 行に収まっているので、行を取り出して前後の決まった形を剥がす。
 */
function fallbackFor(token: string): string | null {
  const line = DIAGRAM_STYLES.split('\n').find((row) => row.includes(`var(${token},`));
  if (line === undefined) return null;
  const opened = line.slice(line.indexOf(`var(${token},`) + `var(${token},`.length);
  const closed = opened.lastIndexOf(')));');
  return closed < 0 ? null : opened.slice(0, closed).trim();
}

describe('配色トークン', () => {
  it('ライトの 7 値が DIAGRAM_STYLES の水墨既定と一致する', () => {
    const entries = Object.entries(DIAGRAM_THEME_TOKENS.light);
    expect(entries).toHaveLength(7);
    for (const [token, value] of entries) {
      expect([token, fallbackFor(token)]).toEqual([token, value]);
    }
  });

  it('ダークはライトと同じ鍵を過不足なく持つ', () => {
    // 片方にだけ鍵を足すと、その項目だけが一方のモードで水墨既定へ落ちる（ダークの図に
    // ライトの色が 1 つ混ざる形で壊れ、全体が壊れるより気づきにくい）。
    expect(Object.keys(DIAGRAM_THEME_TOKENS.dark).sort())
      .toEqual(Object.keys(DIAGRAM_THEME_TOKENS.light).sort());
  });

  it('ダークの値はライトと 1 つも同じでない', () => {
    for (const [token, value] of Object.entries(DIAGRAM_THEME_TOKENS.dark)) {
      expect([token, value]).not.toEqual([token, DIAGRAM_THEME_TOKENS.light[token]]);
    }
  });

  it('参照の連鎖は宿主のトークンを先に見る', () => {
    // 順序が入れ替わると「自給は宿主が撒いていないときだけ」が成り立たなくなる。
    for (const token of Object.keys(DIAGRAM_THEME_TOKENS.light)) {
      const chain = new RegExp(`var\\(--am-color-[a-z-]+, var\\(--vscode-[a-zA-Z-]+, var\\(${token},`);
      expect(chain.test(DIAGRAM_STYLES)).toBe(true);
    }
  });
});
