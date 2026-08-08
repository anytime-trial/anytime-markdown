/**
 * i18n 完全性ガード。
 *
 * 過去、コードが参照するキー（c4.matrix.title / c4.scatter.tabScatter など）が
 * en/ja/types に未定義のまま残り、UI に生キーが表示される回帰が発生した。
 * en と ja のキー集合一致と、ポップアップ系キーの実在・非空を検証する。
 */
import { en } from '../en';
import { ja } from '../ja';

describe('i18n key parity', () => {
  it('en と ja は同一のキー集合を持つ', () => {
    const enKeys = Object.keys(en).sort();
    const jaKeys = Object.keys(ja).sort();
    const missingInJa = enKeys.filter((k) => !(k in ja));
    const missingInEn = jaKeys.filter((k) => !(k in en));
    expect(missingInJa).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  it('全キーの値が非空文字列', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value === 'string' && value.length > 0).toBe(true);
      expect(typeof (ja as unknown as Record<string, string>)[key] === 'string').toBe(true);
    }
  });
});

describe('C4 popup i18n keys exist (regression)', () => {
  // これらは過去 i18n 未定義で生キー表示されていた（ポップアップ題名 / scatter タブ /
  // tour / defect risk / filter）。en・ja 双方で実在し生キーでないことを保証する。
  const requiredKeys = [
    'c4.matrix.title',
    'c4.graph.title',
    'c4.scatter.tabScatter',
    'c4.scatter.tabGalaxy',
    'c4.scatter.tabCity',
    'c4.scatter.tour',
    'c4.scatter.tourStop',
    'c4.defectRisk.window',
    'c4.defectRisk.halfLife',
    'c4.defectRisk.calculating',
    'c4.defectRisk.off',
    'filter.workspaceAll',
  ] as const;

  it.each(requiredKeys)('%s が en/ja に定義されキー名と異なる訳語を持つ', (key) => {
    const enVal = (en as unknown as Record<string, string>)[key];
    const jaVal = (ja as unknown as Record<string, string>)[key];
    expect(enVal).toBeTruthy();
    expect(jaVal).toBeTruthy();
    expect(enVal).not.toBe(key);
    expect(jaVal).not.toBe(key);
  });
});

/**
 * 2026-08-05: Memory > Bugs を Flight Record > Bug Fixed へ移設した際、i18n キーを
 * `caravan.bug.*` → `flightRecord.bugfix.*` へ一括改名した。パネル側の `t` は引数が
 * `string` 型のため、改名漏れがあっても tsc / jest は通り、実機だけ生キー表示になる。
 * ソースの `t('...')` リテラルを走査し、en / ja 双方に実在することを機械で固定する。
 */
describe('移設パネルが参照する i18n キーは実在する', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');

  const targets = [
    '../../views/flightRecordPanel.ts',
    '../../views/caravan/bugHistoryPanel.ts',
    '../../views/caravan/bugCausalPanel.ts',
  ];

  it.each(targets)('%s の参照キーが en / ja に揃っている', (relative) => {
    const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
    const keys = [...source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'\s*\)/g)].map((m) => m[1]);
    // 走査そのものが空振りしていないことを先に確かめる（0 件は「全部 OK」ではない）
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.filter(
      (k) => !(k in (en as unknown as Record<string, string>)) || !(k in (ja as unknown as Record<string, string>)),
    );
    expect(missing).toEqual([]);
  });
});
