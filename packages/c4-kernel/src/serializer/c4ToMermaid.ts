import type { C4Model, C4Element, C4ElementType } from '../types';

/** C4Level → Mermaid 図種別 */
const LEVEL_TO_DIAGRAM: Readonly<Record<string, string>> = {
  context: 'C4Context',
  container: 'C4Container',
  component: 'C4Component',
  code: 'C4Component',
};

/** C4ElementType → Mermaid 関数名（通常 / 外部） */
const TYPE_TO_FUNC: Readonly<Record<C4ElementType, { normal: string; ext: string; hasTech: boolean }>> = {
  person:      { normal: 'Person',      ext: 'Person_Ext',      hasTech: false },
  system:      { normal: 'System',      ext: 'System_Ext',      hasTech: false },
  container:   { normal: 'Container',   ext: 'Container_Ext',   hasTech: true },
  containerDb: { normal: 'ContainerDb', ext: 'ContainerDb_Ext', hasTech: true },
  component:   { normal: 'Component',   ext: 'Component_Ext',   hasTech: true },
  code:        { normal: 'Code',        ext: 'Code',            hasTech: false },
};

/** Boundary として子要素を持つ型 → Mermaid Boundary 関数名 */
const BOUNDARY_FUNC: Readonly<Partial<Record<C4ElementType, string>>> = {
  system: 'System_Boundary',
  container: 'Container_Boundary',
  component: 'Container_Boundary',
};

function escapeQuotes(s: string): string {
  return s.replaceAll('"', '\\"');
}

function serializeElement(elem: C4Element): string {
  const spec = TYPE_TO_FUNC[elem.type];
  const func = elem.external ? spec.ext : spec.normal;
  const args: string[] = [elem.id, `"${escapeQuotes(elem.name)}"`];
  if (spec.hasTech && elem.technology) {
    args.push(`"${escapeQuotes(elem.technology)}"`);
  }
  if (elem.description) {
    args.push(`"${escapeQuotes(elem.description)}"`);
  }
  return `${func}(${args.join(', ')})`;
}

/** C4Model を Mermaid C4 テキストにシリアライズする */
export function c4ToMermaid(model: C4Model): string {
  const diagramType = LEVEL_TO_DIAGRAM[model.level] ?? 'C4Component';
  const lines: string[] = [diagramType];

  if (model.title) {
    lines.push(`  title ${model.title}`);
  }

  // boundaryId → 子要素のマップを構築
  const childrenOf = new Map<string, C4Element[]>();
  const rootElements: C4Element[] = [];

  for (const elem of model.elements) {
    if (elem.boundaryId) {
      const list = childrenOf.get(elem.boundaryId) ?? [];
      list.push(elem);
      childrenOf.set(elem.boundaryId, list);
    } else {
      rootElements.push(elem);
    }
  }

  function writeElement(elem: C4Element, indent: string): void {
    const children = childrenOf.get(elem.id);

    const boundaryFunc = BOUNDARY_FUNC[elem.type];
    if (boundaryFunc && children) {
      // Boundary 型で子を持つ場合: Element 定義 + Boundary ブロック
      lines.push(`${indent}${serializeElement(elem)}`);
      lines.push(`${indent}${boundaryFunc}(${elem.id}, "${escapeQuotes(elem.name)}") {`);
      for (const child of children) {
        writeElement(child, indent + '  ');
      }
      lines.push(`${indent}}`);
    } else {
      lines.push(`${indent}${serializeElement(elem)}`);
      if (children) {
        for (const child of children) {
          writeElement(child, indent);
        }
      }
    }
  }

  for (const elem of rootElements) {
    writeElement(elem, '  ');
  }

  // Relationships
  for (const rel of model.relationships) {
    const args: string[] = [rel.from, rel.to];
    if (rel.label) args.push(`"${escapeQuotes(rel.label)}"`);
    if (rel.technology) args.push(`"${escapeQuotes(rel.technology)}"`);
    const func = rel.bidirectional ? 'BiRel' : 'Rel';
    lines.push(`  ${func}(${args.join(', ')})`);
  }

  return lines.join('\n') + '\n';
}
