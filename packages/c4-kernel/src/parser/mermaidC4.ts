import type { C4Model, C4Element, C4Relationship, C4Level, BoundaryInfo } from '../types';

/** Mermaid C4図種別 → C4Level マッピング */
const DIAGRAM_LEVEL: Readonly<Record<string, C4Level>> = {
  C4Context: 'context',
  C4Container: 'container',
  C4Component: 'component',
  C4Dynamic: 'component',
};

/** 要素関数名 → { type, hastech, external } マッピング */
interface ElementDef {
  type: C4Element['type'];
  hasTech: boolean;
  external: boolean;
}

const ELEMENT_DEFS: Readonly<Record<string, ElementDef>> = {
  Person:           { type: 'person',      hasTech: false, external: false },
  Person_Ext:       { type: 'person',      hasTech: false, external: true },
  System:           { type: 'system',      hasTech: false, external: false },
  System_Ext:       { type: 'system',      hasTech: false, external: true },
  Container:        { type: 'container',   hasTech: true,  external: false },
  Container_Ext:    { type: 'container',   hasTech: true,  external: true },
  ContainerDb:      { type: 'containerDb', hasTech: true,  external: false },
  ContainerDb_Ext:  { type: 'containerDb', hasTech: true,  external: true },
  Component:        { type: 'component',   hasTech: true,  external: false },
  Component_Ext:    { type: 'component',   hasTech: true,  external: true },
  Code:             { type: 'code',        hasTech: false, external: false },
};

/** 引数文字列をパースして配列にする（カンマ区切り、クォート内のカンマは無視） */
function parseArgs(argsStr: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of argsStr) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  args.push(current.trim());
  return args.map(a => a.replace(/^["']|["']$/g, '').trim());
}

/** Mermaid C4 テキストから境界情報を抽出する */
export function extractBoundaries(input: string): BoundaryInfo[] {
  const boundaries: BoundaryInfo[] = [];
  const lines = input.split('\n').map(l => l.trim());
  for (const line of lines) {
    const match = /^(\w+_?Boundary)\s*\(\s*([^,]+),\s*"([^"]+)"\s*\)/.exec(line);
    if (match) {
      boundaries.push({ id: match[2].trim(), name: match[3] });
    }
  }
  return boundaries;
}

/** Mermaid C4記法を解析して C4Model を返す */
export function parseMermaidC4(input: string): C4Model {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Empty input');

  const lines = trimmed.split('\n').map(l => l.trim());

  // Detect diagram type
  const headerLine = lines.find(l => Object.keys(DIAGRAM_LEVEL).some(k => l.startsWith(k)));
  if (!headerLine) throw new Error('Missing C4 diagram type (C4Context, C4Container, C4Component, C4Dynamic)');

  const diagramType = Object.keys(DIAGRAM_LEVEL).find(k => headerLine.startsWith(k))!;
  const level = DIAGRAM_LEVEL[diagramType];

  let title: string | undefined;
  const elements: C4Element[] = [];
  const relationships: C4Relationship[] = [];
  const boundaryStack: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('%%')) continue;
    if (line in DIAGRAM_LEVEL || Object.keys(DIAGRAM_LEVEL).some(k => line.startsWith(k) && line.length === k.length)) continue;

    // title
    const titleMatch = /^title\s+(.+)$/.exec(line);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    // Boundary open: System_Boundary(id, "name") { or Boundary(id, "name") {
    // Also: Container_Boundary, Enterprise_Boundary
    const boundaryMatch = /^(\w+_?Boundary)\s*\(\s*(.+)\)\s*\{?\s*$/.exec(line);
    if (boundaryMatch) {
      const args = parseArgs(boundaryMatch[2]);
      boundaryStack.push(args[0]);
      continue;
    }

    // Boundary close
    if (line === '}') {
      boundaryStack.pop();
      continue;
    }

    // Element: FunctionName(id, "name", ...)
    const elemMatch = /^(\w+)\s*\(\s*(.+)\)\s*$/.exec(line);
    if (elemMatch) {
      const funcName = elemMatch[1];
      const args = parseArgs(elemMatch[2]);

      // Relationship: Rel(from, to, "label", "tech") or Rel_D, BiRel, etc.
      if (funcName.startsWith('Rel') || funcName === 'BiRel') {
        const rel: C4Relationship = {
          from: args[0],
          to: args[1],
          label: args[2] || undefined,
          technology: args[3] || undefined,
          ...(funcName === 'BiRel' ? { bidirectional: true } : {}),
        };
        relationships.push(rel);
        continue;
      }

      // Element
      const def = ELEMENT_DEFS[funcName];
      if (def) {
        const elem: C4Element = {
          id: args[0],
          type: def.type,
          name: args[1],
          ...(def.hasTech && args[2] ? { technology: args[2] } : {}),
          ...(def.hasTech ? { description: args[3] || undefined } : { description: args[2] || undefined }),
          ...(def.external ? { external: true } : {}),
          ...(boundaryStack.length > 0 ? { boundaryId: boundaryStack.at(-1) } : {}),
        };
        // Remove undefined fields
        const clean = Object.fromEntries(
          Object.entries(elem).filter(([, v]) => v !== undefined),
        ) as C4Element;
        elements.push(clean);
        continue;
      }
    }
  }

  return { title, level, elements, relationships };
}
