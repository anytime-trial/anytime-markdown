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
    const match = /^(\w+_?Boundary)\s*\(([^,)]+),\s*"([^"]+)"\s*\)/.exec(line);
    if (match) {
      boundaries.push({ id: match[2].trim(), name: match[3] });
    }
  }
  return boundaries;
}

/** ダイアグラムヘッダー行かどうか判定する */
function isDiagramHeader(line: string): boolean {
  return line in DIAGRAM_LEVEL ||
    Object.keys(DIAGRAM_LEVEL).some(k => line.startsWith(k) && line.length === k.length);
}

/** Rel/BiRel 行をパースして C4Relationship を返す */
function parseRelationship(funcName: string, args: string[]): C4Relationship {
  return {
    from: args[0],
    to: args[1],
    label: args[2] || undefined,
    technology: args[3] || undefined,
    ...(funcName === 'BiRel' ? { bidirectional: true } : {}),
  };
}

/** Element 行をパースして C4Element を返す（undefined フィールド除去済み） */
function parseElement(funcName: string, args: string[], boundaryStack: string[]): C4Element | null {
  const def = ELEMENT_DEFS[funcName];
  if (!def) return null;
  const elem: C4Element = {
    id: args[0],
    type: def.type,
    name: args[1],
    ...(def.hasTech && args[2] ? { technology: args[2] } : {}),
    ...(def.hasTech ? { description: args[3] || undefined } : { description: args[2] || undefined }),
    ...(def.external ? { external: true } : {}),
    ...(boundaryStack.length > 0 ? { boundaryId: boundaryStack.at(-1) } : {}),
  };
  return Object.fromEntries(
    Object.entries(elem).filter(([, v]) => v !== undefined),
  ) as C4Element;
}

interface ParseState {
  title: string | undefined;
  elements: C4Element[];
  relationships: C4Relationship[];
  boundaryStack: string[];
}

/** 1行をパースして state を更新する */
function parseLine(line: string, state: ParseState): void {
  if (!line || line.startsWith('%%')) return;
  if (isDiagramHeader(line)) return;

  const titleMatch = /^title\s+(\S(?:.*\S)?)$/.exec(line);
  if (titleMatch) {
    state.title = titleMatch[1].trim();
    return;
  }

  // `[A-Za-z][A-Za-z0-9_]*Boundary` で `\w+_?Boundary` の曖昧なバックトラックを除去。
  // 入力は line.trim() 済みのため、末尾の `\s*` を取り除き、`)` 後の空白は
  // 限定数 (0-2 個) に縛って CodeQL `js/polynomial-redos` の対象から外す。
  const boundaryMatch = /^([A-Za-z]\w*Boundary)[ \t]{0,2}\(([^)]*)\)(?:[ \t]{1,2}\{)?$/.exec(line);
  if (boundaryMatch) {
    state.boundaryStack.push(parseArgs(boundaryMatch[2])[0]);
    return;
  }

  if (line === '}') {
    state.boundaryStack.pop();
    return;
  }

  const elemMatch = /^(\w+)\s*\(([^)]*)\)\s*$/.exec(line);
  if (!elemMatch) return;

  const funcName = elemMatch[1];
  const args = parseArgs(elemMatch[2]);

  if (funcName.startsWith('Rel') || funcName === 'BiRel') {
    state.relationships.push(parseRelationship(funcName, args));
    return;
  }

  const el = parseElement(funcName, args, state.boundaryStack);
  if (el) state.elements.push(el);
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

  const state: ParseState = {
    title: undefined,
    elements: [],
    relationships: [],
    boundaryStack: [],
  };

  for (const line of lines) {
    parseLine(line, state);
  }

  return { title: state.title, level, elements: state.elements, relationships: state.relationships };
}
