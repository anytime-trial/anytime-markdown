import type { NodeType } from '../types';

export interface ParsedNode {
  mermaidId: string;
  text: string;
  type: NodeType;
  borderRadius?: number;
  groupId?: string;
}

export interface ParsedEdge {
  fromId: string;
  toId: string;
  label?: string;
  hasArrow: boolean;
  dashed?: boolean;
  thick?: boolean;
}

export interface SubgraphInfo {
  mermaidId: string;
  title: string;
}

/** Strip surrounding quotes (double or single) from a string. */
export function stripQuotes(text: string): string {
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Parse a node definition like `A[text]`, `B(text)`, `C{text}`, etc.
 * Returns the mermaid ID, label text, and resolved node type.
 * Returns null if the string is not a node definition.
 */
export function parseNodeDef(token: string): ParsedNode | null {
  // Order matters: multi-char delimiters first
  const patterns: Array<{ regex: RegExp; type: NodeType; borderRadius?: number }> = [
    { regex: /^(\w+)\(\[(.+?)\]\)$/, type: 'ellipse' },           // ([stadium])
    { regex: /^(\w+)\(\((.+?)\)\)$/, type: 'ellipse' },           // ((circle))
    { regex: /^(\w+)\[\((.+?)\)\]$/, type: 'cylinder' },          // [(cylinder)]
    { regex: /^(\w+)\{\{(.+?)\}\}$/, type: 'diamond' },           // {{hexagon}}
    { regex: /^(\w+)\[(.+?)\]$/, type: 'rect' },                  // [rect]
    { regex: /^(\w+)\((.+?)\)$/, type: 'rect', borderRadius: 10 }, // (round)
    { regex: /^(\w+)\{(.+?)\}$/, type: 'diamond' },               // {diamond}
    { regex: /^(\w+)>(.+?)\]$/, type: 'parallelogram' },          // >asymmetric]
  ];

  for (const { regex, type, borderRadius } of patterns) {
    const m = regex.exec(token);
    if (m) {
      return { mermaidId: m[1], text: stripQuotes(m[2]), type, borderRadius };
    }
  }

  // Plain ID (no brackets) — used in edges
  if (/^\w+$/.test(token)) {
    return { mermaidId: token, text: token, type: 'rect' };
  }
  return null;
}

// Edge arrow patterns sorted by specificity (longer patterns first)
export const EDGE_PATTERNS: Array<{
  regex: RegExp;
  hasArrow: boolean;
  dashed?: boolean;
  thick?: boolean;
  labelGroup?: number;
}> = [
  // Pipe-label variants: -->|label|, -.->|label|, ==>|label|
  { regex: /^==>\|(.+?)\|$/, hasArrow: true, thick: true, labelGroup: 1 },
  { regex: /^-\.->\|(.+?)\|$/, hasArrow: true, dashed: true, labelGroup: 1 },
  { regex: /^-->\|(.+?)\|$/, hasArrow: true, labelGroup: 1 },
  { regex: /^---\|(.+?)\|$/, hasArrow: false, labelGroup: 1 },
  // No-label arrows
  { regex: /^==>$/, hasArrow: true, thick: true },
  { regex: /^-.->$/, hasArrow: true, dashed: true },
  { regex: /^-\.-$/, hasArrow: false, dashed: true },
  { regex: /^-->$/, hasArrow: true },
  { regex: /^---$/, hasArrow: false },
];

// Inline label patterns: -- label -->, == label ==>, -. label .->
export const INLINE_LABEL_PATTERNS: Array<{
  startRegex: RegExp;
  endRegex: RegExp;
  hasArrow: boolean;
  dashed?: boolean;
  thick?: boolean;
}> = [
  { startRegex: /^==$/, endRegex: /^==>$/, hasArrow: true, thick: true },
  { startRegex: /^-\.$/, endRegex: /^\.->$/, hasArrow: true, dashed: true },
  { startRegex: /^--$/, endRegex: /^-->$/, hasArrow: true },
  { startRegex: /^--$/, endRegex: /^---$/, hasArrow: false },
];

export function parseEdge(tokens: string[]): { consumed: number; edge: ParsedEdge } | null {
  // Need at least 3 tokens: FROM ARROW TO
  if (tokens.length < 3) return null;

  const fromNode = parseNodeDef(tokens[0]);
  if (!fromNode) return null;

  // Try simple edge pattern (FROM ARROW TO)
  for (const pat of EDGE_PATTERNS) {
    const m = pat.regex.exec(tokens[1]);
    if (m) {
      const toNode = parseNodeDef(tokens[2]);
      if (!toNode) return null;
      return {
        consumed: 3,
        edge: {
          fromId: fromNode.mermaidId,
          toId: toNode.mermaidId,
          label: pat.labelGroup ? m[pat.labelGroup] : undefined,
          hasArrow: pat.hasArrow,
          dashed: pat.dashed,
          thick: pat.thick,
        },
      };
    }
  }

  // Try inline label pattern (FROM -- label --> TO)
  if (tokens.length >= 4) {
    for (const pat of INLINE_LABEL_PATTERNS) {
      if (pat.startRegex.test(tokens[1])) {
        // Find the matching end token
        for (let i = 3; i < tokens.length; i++) {
          if (pat.endRegex.test(tokens[i])) {
            const label = tokens.slice(2, i).join(' ');
            const toNode = parseNodeDef(tokens[i + 1]);
            if (!toNode) return null;
            return {
              consumed: i + 2,
              edge: {
                fromId: fromNode.mermaidId,
                toId: toNode.mermaidId,
                label,
                hasArrow: pat.hasArrow,
                dashed: pat.dashed,
                thick: pat.thick,
              },
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Tokenize a line, respecting brackets and pipe-delimited labels.
 * Splits on whitespace but keeps bracketed/pipe content together.
 */
export function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  let inPipe = false;
  const brackets: Record<string, string> = { '[': ']', '(': ')', '{': '}' };
  const closers = new Set(Object.values(brackets));

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (depth === 0 && !inPipe && (ch === ' ' || ch === '\t')) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;

    if (ch === '|' && depth === 0) {
      inPipe = !inPipe;
    } else if (brackets[ch]) {
      depth++;
    } else if (closers.has(ch)) {
      depth = Math.max(0, depth - 1);
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
