/**
 * isInternalLink のテスト（webview リンククリックの判定）。
 *
 * リグレッション: 内部リンクのクリックがブラウザの vscode-resource URL へ遷移してしまう
 * バグ。ファイルを指す内部リンク（非 http(s)・非スキーム・非 `#`）を判定し、webview 側で
 * 横取りして extension host に開かせる。
 */
import { isInternalLink } from '../linkClick';

describe('isInternalLink', () => {
  it.each([
    ['http://example.com', false],
    ['https://example.com', false],
    ['mailto:user@example.com', false],
    ['vscode:extension/foo', false],
    ['tel:+81312345678', false],
    ['//example.com', false],
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
