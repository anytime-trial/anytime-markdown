import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { sanitize } from '../../tools/sanitizeMarkdown';

describe('sanitize', () => {
  it('should sanitize markdown content', async () => {
    const input = '# Title\n\nSome content\n';
    const result = await sanitize({ content: input }, '/tmp');
    expect(typeof result).toBe('string');
    expect(result).toContain('# Title');
  });

  it('should read from file when path is provided', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'test.md'), '# Hello\n\nWorld\n');
      const result = await sanitize({ path: 'test.md' }, tmpDir);
      expect(result).toContain('# Hello');
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  it('should throw when neither content nor path is provided', async () => {
    await expect(sanitize({}, '/tmp')).rejects.toThrow('Either content or path must be provided');
  });

  it('should preserve code blocks', async () => {
    const input = '# Title\n\n```js\nconst x = 1;\n```\n';
    const result = await sanitize({ content: input }, '/tmp');
    expect(result).toContain('```js');
    expect(result).toContain('const x = 1;');
  });
});

describe('sanitize - window already defined branch', () => {
  it('window が既に globalThis に設定されているときも sanitize は正常動作する', async () => {
    // jest.isolateModules でモジュールを再ロードし、window を先に設定することで
    // setupDomGlobals 内の if (typeof window === 'undefined') の else 分岐をカバーする
    await jest.isolateModulesAsync(async () => {
      // window を先に設定する（JSDOM 環境模擬）
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM('');
      (globalThis as Record<string, unknown>).window = dom.window;
      try {
        const { sanitize: sanitize2 } = await import('../../tools/sanitizeMarkdown');
        // この呼び出し時点で sanitizeMarkdownFn は null (モジュール再ロード) だが
        // setupDomGlobals が呼ばれると window は既に存在 → else 分岐を通る
        const result = await sanitize2({ content: '# Window Test\n' }, '/tmp');
        expect(result).toContain('# Window Test');
      } finally {
        // テスト後に window を元に戻す（他のテストに影響しないよう）
        delete (globalThis as Record<string, unknown>).window;
      }
    });
  });
});
