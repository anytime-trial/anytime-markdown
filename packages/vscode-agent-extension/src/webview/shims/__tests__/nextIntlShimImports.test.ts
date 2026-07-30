import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * next-intl shim がバレルから import していないことを固定する。
 *
 * webpack は `next-intl` をこの shim へ alias する。shim がバレル
 * （`@anytime-markdown/tickets-viewer`）から import すると
 * バレル → TicketsPanel → next-intl(=shim) → バレル の循環が閉じ、
 * バレルの初期化完了前に messages を読みに行って**実行時に**壊れる。
 * 実機で `Uncaught ReferenceError: Cannot access 'sn' before initialization` として発生した。
 *
 * この壊れ方は型検査でもユニットテストでも検出できない。ts-jest（CommonJS）は循環を
 * 遅延 require で吸収してしまい、webpack の ESM 出力とは初期化順序が異なるためである。
 * バンドルを実行して確かめる方法もあるが、`dist/` 依存のテストは未ビルド環境で落ちるか、
 * 存在しなければスキップして fail-open になる。ここでは import 元という不変条件を
 * ソースに対して直接固定する。
 *
 * バンドル実行での確認手順（手動・リリース前）:
 *   npm run package -w anytime-agent
 *   node -e "const {JSDOM}=require('jsdom');const d=new JSDOM('<div id=root></div>',{runScripts:'outside-only'});
 *            d.window.acquireVsCodeApi=()=>({postMessage(){}});
 *            d.window.eval(require('fs').readFileSync('packages/vscode-agent-extension/dist/tickets-webview.js','utf8'));"
 */
const SHIM_PATH = join(__dirname, '..', 'next-intl.ts');
const BARREL = '@anytime-markdown/tickets-viewer';

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]);
}

describe('next-intl shim の import 元', () => {
  const source = readFileSync(SHIM_PATH, 'utf8');
  const specifiers = importSpecifiers(source);

  it('解析対象の import を実際に拾えている（抽出が空なら検査が無効）', () => {
    expect(specifiers.length).toBeGreaterThan(0);
  });

  it('tickets-viewer のバレルから import しない（循環 import の回帰）', () => {
    expect(specifiers).not.toContain(BARREL);
  });

  it('i18n はサブパス export から取る', () => {
    expect(specifiers).toContain(`${BARREL}/i18n/ja`);
    expect(specifiers).toContain(`${BARREL}/i18n/en`);
  });
});
