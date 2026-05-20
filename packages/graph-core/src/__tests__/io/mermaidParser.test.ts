import {
  parseNodeDef,
  parseEdge,
  tokenizeLine,
  stripQuotes,
} from '../../io/mermaidParser';

describe('stripQuotes', () => {
  it('strips double quotes', () => {
    expect(stripQuotes('"hello"')).toBe('hello');
  });
  it('strips single quotes', () => {
    expect(stripQuotes("'hello'")).toBe('hello');
  });
  it('returns unchanged when no quotes', () => {
    expect(stripQuotes('hello')).toBe('hello');
  });
  it('returns unchanged for mismatched quotes', () => {
    expect(stripQuotes('"hello\'')).toBe('"hello\'');
  });
});

describe('parseNodeDef', () => {
  it('returns null for non-word characters (line 62)', () => {
    // Contains special chars — does not match any pattern or plain-id rule
    expect(parseNodeDef('hello-world')).toBeNull();
    expect(parseNodeDef('-->')).toBeNull();
    expect(parseNodeDef('|label|')).toBeNull();
  });

  it('returns rect for plain word id', () => {
    const result = parseNodeDef('MyNode');
    expect(result).not.toBeNull();
    expect(result!.mermaidId).toBe('MyNode');
    expect(result!.type).toBe('rect');
  });

  it('parses hexagon node {{...}}', () => {
    const result = parseNodeDef('A{{Hex}}');
    expect(result!.type).toBe('diamond');
    expect(result!.text).toBe('Hex');
  });

  it('parses parallelogram >...]', () => {
    const result = parseNodeDef('A>flag]');
    expect(result!.type).toBe('parallelogram');
    expect(result!.text).toBe('flag');
  });

  it('parses cylinder [(text)]', () => {
    const result = parseNodeDef('A[(DB)]');
    expect(result!.type).toBe('cylinder');
    expect(result!.text).toBe('DB');
  });

  it('parses stadium ([text])', () => {
    const result = parseNodeDef('A([Std])');
    expect(result!.type).toBe('ellipse');
    expect(result!.text).toBe('Std');
  });

  it('parses circle ((text))', () => {
    const result = parseNodeDef('A((Cir))');
    expect(result!.type).toBe('ellipse');
    expect(result!.text).toBe('Cir');
  });
});

describe('parseEdge', () => {
  it('returns null for fewer than 3 tokens', () => {
    expect(parseEdge(['A', '-->'])).toBeNull();
  });

  it('returns null when first token is not a node', () => {
    expect(parseEdge(['-->', 'A', 'B'])).toBeNull();
  });

  it('parses simple --> edge', () => {
    const result = parseEdge(['A', '-->', 'B']);
    expect(result).not.toBeNull();
    expect(result!.edge.fromId).toBe('A');
    expect(result!.edge.toId).toBe('B');
    expect(result!.edge.hasArrow).toBe(true);
    expect(result!.consumed).toBe(3);
  });

  it('parses pipe-label -->|label| edge', () => {
    const result = parseEdge(['A', '-->|Yes|', 'B']);
    expect(result!.edge.label).toBe('Yes');
    expect(result!.edge.hasArrow).toBe(true);
  });

  it('parses dashed -.-> edge', () => {
    const result = parseEdge(['A', '.->', 'B']);
    // -.-> not matched by .->, but -.-  pattern is
    // '-.-' without arrow
    expect(parseEdge(['A', '-.->',  'B'])!.edge.dashed).toBe(true);
  });

  it('parses thick ==> edge', () => {
    const result = parseEdge(['A', '==>', 'B']);
    expect(result!.edge.thick).toBe(true);
    expect(result!.edge.hasArrow).toBe(true);
  });

  it('parses --- no-arrow edge', () => {
    const result = parseEdge(['A', '---', 'B']);
    expect(result!.edge.hasArrow).toBe(false);
  });

  it('parses inline label -- label --> (3-token label)', () => {
    // tokens: [A, --, hello, -->, B]
    const result = parseEdge(['A', '--', 'hello', '-->', 'B']);
    expect(result).not.toBeNull();
    expect(result!.edge.label).toBe('hello');
    expect(result!.edge.hasArrow).toBe(true);
  });

  it('returns null for inline label when toNode is invalid (line 155)', () => {
    // tokens: [A, --, label, -->, --invalid--]
    // The toNode token '--invalid--' has non-word chars → parseNodeDef returns null
    const result = parseEdge(['A', '--', 'label', '-->', '--invalid--']);
    expect(result).toBeNull();
  });

  it('returns null when toNode in simple pattern is invalid', () => {
    // 'A --> -->' — second --> is not a valid node def
    const result = parseEdge(['A', '-->', '-->']);
    expect(result).toBeNull();
  });
});

describe('tokenizeLine', () => {
  it('splits on whitespace', () => {
    expect(tokenizeLine('A --> B')).toEqual(['A', '-->', 'B']);
  });

  it('keeps bracketed content together', () => {
    expect(tokenizeLine('A[Hello World] --> B')).toEqual(['A[Hello World]', '-->', 'B']);
  });

  it('handles pipe-delimited labels', () => {
    expect(tokenizeLine('A -->|Yes| B')).toEqual(['A', '-->|Yes|', 'B']);
  });

  it('handles nested brackets', () => {
    expect(tokenizeLine('A[(DB)] --> B')).toEqual(['A[(DB)]', '-->', 'B']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenizeLine('')).toEqual([]);
  });

  it('handles tabs as whitespace', () => {
    expect(tokenizeLine('A\t-->\tB')).toEqual(['A', '-->', 'B']);
  });
});
