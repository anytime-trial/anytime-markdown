/** @jest-environment jsdom */
import {
  createWebComponentMount,
  resolveUntrustedContentTarget,
} from '../app/[locale]/components/markdownWebComponentMount';
import type { AnytimeMarkdownEditorElement } from '@anytime-markdown/markdown-editor';

// 信頼境界属性（spec/35.mcp/04.tool-irreversibility「境界属性」）は本文を描画する最小の親に付ける。
describe('createWebComponentMount untrustedContent', () => {
  it('anytime-markdown-view は chromeless なので要素自体に付く', () => {
    const container = document.createElement('div');
    createWebComponentMount('anytime-markdown-view', { untrustedContent: true })(container, {} as never);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName.toLowerCase()).toBe('anytime-markdown-view');
    expect(el.getAttribute('data-untrusted-content')).toBe('true');
  });

  it('untrustedContent 未指定なら属性を付けない', () => {
    const container = document.createElement('div');
    createWebComponentMount('anytime-markdown-view')(container, {} as never);
    expect(container.querySelector('[data-untrusted-content]')).toBeNull();
  });

  it('rich editor は本文 DOM（editor.view.dom）に付け、ツールバー等の chrome を含めない', () => {
    const contentDom = document.createElement('div');
    const fake = { editor: { view: { dom: contentDom } }, root: document.createElement('div') } as unknown as AnytimeMarkdownEditorElement;
    expect(resolveUntrustedContentTarget('anytime-markdown-rich-editor', fake)).toBe(contentDom);
  });

  it('本文 DOM が取れない場合は要素自体へ縮退する', () => {
    const fake = { editor: null, root: null } as unknown as AnytimeMarkdownEditorElement;
    expect(resolveUntrustedContentTarget('anytime-markdown-rich-editor', fake)).toBe(fake);
  });
});
