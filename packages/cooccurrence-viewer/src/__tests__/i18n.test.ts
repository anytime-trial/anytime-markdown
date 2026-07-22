import fs from 'node:fs';
import path from 'node:path';
import enMessages from '../i18n/en.json';
import jaMessages from '../i18n/ja.json';

function messageKeys(messages: typeof jaMessages): Set<string> {
  return new Set(Object.keys(messages.Cooccurrence));
}

const SOURCE_ROOT = path.resolve(__dirname, '..');

/** 走査対象を列挙する。ui/ は列挙せず走査し、UI ファイルの追加に追従させる。 */
function sourceFiles(): string[] {
  const uiDir = path.join(SOURCE_ROOT, 'ui');
  const ui = fs.readdirSync(uiDir).filter((name) => name.endsWith('.ts')).map((name) => path.join(uiDir, name));
  return [path.join(SOURCE_ROOT, 'mountCooccurrenceViewer.ts'), ...ui];
}

/**
 * `t('key')` と `t('key', { ... })` の両方を拾う。
 * Why not `t\('([^']+)'\)` だけにするか: 変数を取る呼び出しが漏れ、
 * `{var}` を含むキー（最も壊れやすい）だけ検査対象外になるため。
 */
function scanTKeys(files: string[]): string[] {
  const keys = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\('([^']+)'\s*[,)]/g)) {
      const key = match[1];
      if (key) keys.add(key);
    }
  }
  return [...keys].sort();
}

/** `{var}` プレースホルダを取り出す。 */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

/** 走査の空振り検知の下限。実際の参照数はこれを大きく上回る。 */
const SCAN_FLOOR = 20;

/**
 * viewer のソースからは参照されず、ホスト側（web-app のページ・VS Code 拡張）が
 * 使うキー。辞書に置くのは、共起ネットワークの文言を 1 箇所へ集めるため。
 */
const HOST_REFERENCED_KEYS = new Set(['host.openFile']);

describe('cooccurrence i18n messages', () => {
  it('keeps ja and en message structures identical', () => {
    const jaKeys = [...messageKeys(jaMessages)].sort();
    const enKeys = [...messageKeys(enMessages)].sort();
    expect(enKeys).toEqual(jaKeys);
  });

  it('defines every key referenced by UI t() calls in both locales', () => {
    const referencedKeys = scanTKeys(sourceFiles());
    // 走査が空振りしたら「全キー定義済み」と区別がつかない（fail-open）。
    // 実際に相当数を拾えていることを下限として課す。
    expect(referencedKeys.length).toBeGreaterThanOrEqual(SCAN_FLOOR);
    const jaKeys = messageKeys(jaMessages);
    const enKeys = messageKeys(enMessages);
    const missingInJa = referencedKeys.filter((key) => !jaKeys.has(key));
    const missingInEn = referencedKeys.filter((key) => !enKeys.has(key));
    expect({ missingInJa, missingInEn }).toEqual({ missingInJa: [], missingInEn: [] });
  });

  it('has no dictionary key that nothing references', () => {
    // 訳し漏れの逆。使われないキーが溜まると、どれが生きているか分からなくなる。
    const referenced = new Set([...scanTKeys(sourceFiles()), ...HOST_REFERENCED_KEYS]);
    const orphaned = [...messageKeys(jaMessages)].filter((key) => !referenced.has(key));
    expect(orphaned).toEqual([]);
  });

  it('keeps {var} placeholders identical between ja and en', () => {
    // ja が {title}・en が {name} でも例外にならず、未置換の {name} が画面へ出る。
    const mismatched = Object.keys(jaMessages.Cooccurrence).filter((key) => {
      const ja = (jaMessages.Cooccurrence as Record<string, string>)[key] ?? '';
      const en = (enMessages.Cooccurrence as Record<string, string>)[key] ?? '';
      return JSON.stringify(placeholders(ja)) !== JSON.stringify(placeholders(en));
    });
    expect(mismatched).toEqual([]);
  });
});
