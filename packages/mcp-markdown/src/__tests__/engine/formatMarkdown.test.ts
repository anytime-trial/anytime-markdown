import { formatMarkdown } from '@anytime-markdown/markdown-engine';

describe('formatMarkdown (pure)', () => {
  describe('heading blank lines', () => {
    it('ensures 2 blank lines above and 1 below a heading', () => {
      const { result } = formatMarkdown('intro\n# Title\nbody\n');
      expect(result).toBe('intro\n\n\n# Title\n\nbody\n');
    });

    it('does not add blank lines above a heading that is the first body line', () => {
      const { result } = formatMarkdown('# Title\nbody\n');
      expect(result).toBe('# Title\n\nbody\n');
    });

    it('puts exactly 2 blank lines before a following heading', () => {
      const { result } = formatMarkdown('# A\n\ntext\n## B\n\ntext\n');
      expect(result).toBe('# A\n\ntext\n\n\n## B\n\ntext\n');
    });
  });

  describe('collapse blank lines', () => {
    it('caps runs of 3+ blank lines between paragraphs at 2', () => {
      const { result, rulesApplied } = formatMarkdown('a\n\n\n\n\nb\n');
      expect(result).toBe('a\n\n\nb\n');
      expect(rulesApplied.collapseBlankLines).toBeGreaterThan(0);
    });

    it('removes leading blank lines and ensures single trailing newline', () => {
      const { result } = formatMarkdown('\n\na\n\n\n');
      expect(result).toBe('a\n');
    });
  });

  describe('trailing whitespace', () => {
    it('strips a single trailing space and trailing tabs', () => {
      const { result, rulesApplied } = formatMarkdown('a \nb\t\n');
      expect(result).toBe('a\nb\n');
      expect(rulesApplied.trailingWs).toBeGreaterThan(0);
    });

    it('preserves a two-space hard break on paragraph lines (normalizing 3+ to exactly 2)', () => {
      const { result } = formatMarkdown('a  \nb\n');
      expect(result).toBe('a  \nb\n');
      const { result: r2 } = formatMarkdown('a   \nb\n');
      expect(r2).toBe('a  \nb\n');
    });

    it('fully strips trailing spaces on a heading line (no hard break)', () => {
      const { result } = formatMarkdown('# H  \n\nbody\n');
      expect(result).toBe('# H\n\nbody\n');
    });
  });

  describe('list indent', () => {
    it('converts leading tabs to 4 spaces', () => {
      const { result, rulesApplied } = formatMarkdown('- a\n\t- b\n');
      expect(result).toBe('- a\n    - b\n');
      expect(rulesApplied.listIndent).toBeGreaterThan(0);
    });
  });

  describe('block spacing', () => {
    it('inserts a blank line between a paragraph and a following list', () => {
      const { result } = formatMarkdown('text\n- a\n- b\n');
      expect(result).toBe('text\n\n- a\n- b\n');
    });

    it('inserts a blank line after a list before a following paragraph', () => {
      const { result } = formatMarkdown('- a\n- b\ntext\n');
      expect(result).toBe('- a\n- b\n\ntext\n');
    });
  });

  describe('table pipe escape', () => {
    it('escapes pipes inside code spans in table rows', () => {
      const { result } = formatMarkdown('| h |\n| --- |\n| `a|b` |\n');
      expect(result).toContain('`a\\|b`');
    });
  });

  describe('protected regions', () => {
    it('does not modify content inside fenced code blocks', () => {
      const input = '```\n#notheading\nx   \n```\n';
      const { result } = formatMarkdown(input);
      expect(result).toContain('#notheading\nx   \n');
    });

    it('keeps frontmatter verbatim and ensures one blank line after it', () => {
      const { result } = formatMarkdown('---\ntitle: x\n---\n# H\nbody\n');
      expect(result).toBe('---\ntitle: x\n---\n\n# H\n\nbody\n');
    });

    it('does not insert blank lines around a fenced code block inside a list item', () => {
      const input = '- まず実行する\n    ```bash\n    npm run build\n    ```\n- 次に確認する\n';
      const { result } = formatMarkdown(input);
      expect(result).toBe(input);
    });

    it('stays idempotent with an unclosed fenced code block', () => {
      const input = 'text\n```\nno close\n';
      const once = formatMarkdown(input).result;
      const twice = formatMarkdown(once).result;
      expect(twice).toBe(once);
      expect(once.endsWith('no close\n')).toBe(true);
    });
  });

  describe('CRLF handling', () => {
    it('preserves CRLF line endings on CRLF input', () => {
      const { result } = formatMarkdown('a\r\n# H\r\nbody\r\n');
      expect(result).toBe('a\r\n\r\n\r\n# H\r\n\r\nbody\r\n');
    });

    it('detects frontmatter in CRLF documents', () => {
      const { result } = formatMarkdown('---\r\ntitle: x\r\n---\r\n# H\r\nbody\r\n');
      expect(result).toBe('---\r\ntitle: x\r\n---\r\n\r\n# H\r\n\r\nbody\r\n');
    });
  });

  describe('warnings (report only, no auto-fix)', () => {
    it('warns on 3rd-level nesting without removing it', () => {
      const input = '- a\n    - b\n        - c\n';
      const { result, warnings } = formatMarkdown(input);
      expect(result).toBe(input);
      expect(warnings.some((w) => w.rule === 'nestDepth')).toBe(true);
    });

    it('warns on a period directly followed by another text line', () => {
      const { warnings } = formatMarkdown('文章です。\n次の文。\n');
      expect(warnings.some((w) => w.rule === 'hardBreakAfterPeriod')).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('is idempotent on a mixed document', () => {
      const input =
        '---\ntitle: x\n---\nintro\n# A\ntext\n- one\n- two\nmore\n## B\n\n\n\nend\n';
      const once = formatMarkdown(input).result;
      const twice = formatMarkdown(once).result;
      expect(twice).toBe(once);
    });

    it('does not inject zero-width markers or backslash hard breaks', () => {
      const { result } = formatMarkdown('一行目\n二行目\n');
      expect(result).not.toMatch(/[​‌]/);
      expect(result).not.toContain('\\\n');
    });
  });
});
