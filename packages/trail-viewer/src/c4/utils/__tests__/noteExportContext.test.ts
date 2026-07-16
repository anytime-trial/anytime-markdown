import type { C4Element } from '@anytime-markdown/trail-core/c4';

import { buildElementContextMarkdown, escapeTableCell } from '../noteExportContext';

const baseElem: C4Element = {
  id: 'pkg_core',
  name: 'core',
  type: 'container',
  external: false,
};

describe('escapeTableCell', () => {
  it('パイプをエスケープしテーブル構造を壊さない', () => {
    expect(escapeTableCell('a|b')).toBe(String.raw`a\|b`);
  });

  it('改行（LF/CRLF）をスペースへ畳む', () => {
    expect(escapeTableCell('a\nb')).toBe('a b');
    expect(escapeTableCell('a\r\nb')).toBe('a b');
  });

  it('HTML タグはリテラルのまま保持する（実行可能コードとして扱わない）', () => {
    expect(escapeTableCell('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
});

describe('buildElementContextMarkdown', () => {
  it('要素 ID・名前・種別の行を持つ表を生成する', () => {
    const md = buildElementContextMarkdown(baseElem, 'pkg_core', null);
    expect(md).toContain('| 要素 ID | `pkg_core` |');
    expect(md).toContain('| 名前 | core |');
    expect(md).toContain('| 種別 | container |');
    expect(md).not.toContain('| 説明 |');
    expect(md).not.toContain('| リポジトリ |');
  });

  it('説明・リポジトリがあれば行を追加する', () => {
    const md = buildElementContextMarkdown({ ...baseElem, description: 'コア機能' }, 'pkg_core', 'anytime-markdown');
    expect(md).toContain('| 説明 | コア機能 |');
    expect(md).toContain('| リポジトリ | anytime-markdown |');
  });

  it('名前にパイプ・改行が含まれても各行がテーブル行として成立する', () => {
    const md = buildElementContextMarkdown({ ...baseElem, name: 'a|b\nc' }, 'pkg_core', null);
    expect(md).toContain(String.raw`| 名前 | a\|b c |`);
    for (const line of md.split('\n')) {
      expect(line.startsWith('|')).toBe(true);
      expect(line.endsWith('|')).toBe(true);
    }
  });
});
