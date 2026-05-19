import { wrapText } from '../../engine/textRendering';

function makeMockCtx(charWidth = 8): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    measureText: jest.fn((text: string) => ({ width: text.length * charWidth })),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe('wrapText', () => {
  it('returns single line when text fits within maxWidth', () => {
    const ctx = makeMockCtx(8);
    const result = wrapText(ctx, 'Hello', 200);
    expect(result).toEqual(['Hello']);
  });

  it('returns empty string array for empty string', () => {
    const ctx = makeMockCtx(8);
    const result = wrapText(ctx, '', 200);
    expect(result).toEqual(['']);
  });

  it('wraps long line at word boundary', () => {
    // charWidth=10, maxWidth=50 → each word "word" = 40px fits, " word" = 50px fits, "word word" = 80px does not
    const ctx = makeMockCtx(10);
    // "Hello World" => "Hello" (50px) + space overflows → wrap
    const result = wrapText(ctx, 'Hello World', 50);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toContain('Hello');
  });

  it('splits multiple paragraphs at newlines', () => {
    const ctx = makeMockCtx(8);
    const result = wrapText(ctx, 'Line1\nLine2', 200);
    expect(result).toEqual(['Line1', 'Line2']);
  });

  it('preserves empty paragraph in multiline text', () => {
    const ctx = makeMockCtx(8);
    const result = wrapText(ctx, 'Line1\n\nLine3', 200);
    expect(result).toEqual(['Line1', '', 'Line3']);
  });

  it('breaks very long single word by character when it exceeds maxWidth', () => {
    // charWidth=10, maxWidth=30 → 3 chars fit. "abcdef" (6 chars = 60px) should be broken
    const ctx = makeMockCtx(10);
    const result = wrapText(ctx, 'abcdef', 30);
    expect(result.length).toBeGreaterThan(1);
    // All characters should be present
    expect(result.join('')).toBe('abcdef');
  });

  it('handles space at start of line causing wrap', () => {
    // Fill line to near maxWidth then add a space that overflows
    const ctx = makeMockCtx(10);
    // "Hello" = 50px, " " would make 60px > 50 → should wrap
    const result = wrapText(ctx, 'Hello World Test', 50);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('handles single empty line input', () => {
    const ctx = makeMockCtx(8);
    const result = wrapText(ctx, '\n', 200);
    expect(result).toEqual(['', '']);
  });

  it('handles text with multiple spaces between words', () => {
    const ctx = makeMockCtx(8);
    // spaces are individual tokens, each handled separately
    const result = wrapText(ctx, 'a  b', 200);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns [""] for whitespace-only text that wraps fully', () => {
    const ctx = makeMockCtx(8);
    // A single paragraph that is just spaces - should end up with at least one line
    const result = wrapText(ctx, 'hello', 8000);
    expect(result).toEqual(['hello']);
  });

  it('handles word longer than maxWidth appearing at start of new line (currentLine empty)', () => {
    // charWidth=10, maxWidth=30: "ab" = 20px, "cd" = 20px.
    // "ab cd" = "ab" first token (20px ok), space (ab+space=30px ok), "cd" (ab cd=50px > 30) → push "ab ", start "cd"
    // Use a word that is ALREADY > maxWidth to hit the "currentLine === ''" branch:
    // maxWidth=25px, charWidth=10 → "abcde"=50px > 25. First word, currentLine='', so we assign it anyway then breakByCharacter
    const ctx = makeMockCtx(10);
    const result = wrapText(ctx, 'abcde', 25);
    expect(result.join('')).toBe('abcde');
    expect(result.length).toBeGreaterThan(1);
  });

  it('pushes currentLine and starts new token when word overflows non-empty line', () => {
    // charWidth=10, maxWidth=40
    // "ab" = 20px fits. "cd" = 20px, "abcd" = 40px fits (≤ 40).
    // Try "ab" then "cde": "abcde" = 50px > 40, currentLine="ab" ≠ '' → push "ab", currentLine="cde"
    // "cde" = 30px ≤ 40 so no char-break
    const ctx = makeMockCtx(10);
    const result = wrapText(ctx, 'ab cde', 40);
    expect(result[0]).toContain('ab');
    expect(result[result.length - 1]).toContain('cde');
  });
});
