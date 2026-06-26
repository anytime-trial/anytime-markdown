/**
 * resolveLinkClickAction のテスト（webview リンククリックの判定）。
 *
 * リグレッション: 内部リンクの素クリックがブラウザの vscode-resource URL へ遷移して
 * しまうバグ。内部（非 http・非 #）リンクは常にデフォルト遷移を抑止し、追従して開くのは
 * Ctrl/Cmd+クリックまたはダブルクリックのみ（VS Code 流儀）とする。
 */
import { isInternalLink, resolveLinkClickAction } from '../linkClick';

describe('isInternalLink', () => {
  it.each([
    ['http://example.com', false],
    ['https://example.com', false],
    ['mailto:user@example.com', false],
    ['vscode:extension/foo', false],
    ['tel:+81312345678', false],
    ['#section', false],
    ['/README.ja.md', true],
    ['./other.md', true],
    ['../up.md', true],
    ['notes/x.md', true],
    [null, false],
    ['', false],
  ])('isInternalLink(%s) === %s', (href, expected) => {
    expect(isInternalLink(href as string | null)).toBe(expected);
  });
});

describe('resolveLinkClickAction', () => {
  it('http リンクは抑止も open もしない', () => {
    expect(resolveLinkClickAction({ href: 'https://x.com', ctrlOrMeta: false, dblClick: false }))
      .toEqual({ preventDefault: false, open: false });
  });

  it('# アンカーは抑止しない（ページ内遷移を残す）', () => {
    expect(resolveLinkClickAction({ href: '#sec', ctrlOrMeta: false, dblClick: false }))
      .toEqual({ preventDefault: false, open: false });
  });

  it('内部リンクの素クリックは遷移抑止のみ（open しない）', () => {
    expect(resolveLinkClickAction({ href: '/README.ja.md', ctrlOrMeta: false, dblClick: false }))
      .toEqual({ preventDefault: true, open: false });
  });

  it('内部リンクの Ctrl/Cmd+クリックは抑止して open する', () => {
    expect(resolveLinkClickAction({ href: '/README.ja.md', ctrlOrMeta: true, dblClick: false }))
      .toEqual({ preventDefault: true, open: true });
  });

  it('内部リンクのダブルクリックは抑止して open する', () => {
    expect(resolveLinkClickAction({ href: './other.md', ctrlOrMeta: false, dblClick: true }))
      .toEqual({ preventDefault: true, open: true });
  });

  it('null href は何もしない', () => {
    expect(resolveLinkClickAction({ href: null, ctrlOrMeta: true, dblClick: true }))
      .toEqual({ preventDefault: false, open: false });
  });
});
