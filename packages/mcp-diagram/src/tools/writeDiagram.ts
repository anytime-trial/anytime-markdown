import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type DiagramDocument,
  type DiagramFamily,
  type DiagramGroupAxis,
  type DiagramLayout,
  EMPTY_DIAGRAM_LAYOUT,
  parseDiagramDocument,
  serializeDiagramDocument,
  validateDiagramLayout,
} from '@anytime-markdown/diagram-core';

import { resolveSecurePath, validateDiagramExtension } from '../utils/securePath.js';
import { readDiagram } from './readDiagram.js';

export interface WriteDiagramInput {
  path: string;
  title: string;
  lead?: string;
  note?: string;
  legend?: string;
  groups?: DiagramGroupAxis[];
  families: DiagramFamily[];
  annotations?: Record<string, string>;
}

/**
 * 系図を書く。**配置差分（`layout`）は引数に取らない。**
 *
 * 人物と家族を書き換える道具に配置まで持たせると、家族を 1 件足すだけの呼び出しが、渡し忘れた
 * 配置を空で上書きする。配置は `setDiagramLayout` が専任で扱い、ここでは**既存ファイルの配置を
 * そのまま引き継ぐ**。
 */
export async function writeDiagram(input: WriteDiagramInput, rootDir: string): Promise<{ path: string }> {
  validateDiagramExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const document: DiagramDocument = {
    version: 1,
    title: input.title,
    lead: input.lead ?? '',
    note: input.note ?? '',
    legend: input.legend ?? '',
    groups: input.groups ?? [],
    families: input.families,
    annotations: input.annotations ?? {},
    layout: await existingLayout(input.path, rootDir),
  };
  // 書く前に自分の読み取りを通す。通らない形を書くと、次に開いた画面が「読めません」になる。
  if (parseDiagramDocument(JSON.parse(serializeDiagramDocument(document))) === null) {
    throw new Error('[diagram] 書こうとした図を読み戻せません（families は 1 件以上必要です）');
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeDiagramDocument(document), 'utf-8');
  return { path: input.path };
}

export interface SetDiagramLayoutInput {
  path: string;
  /** 人物名 → 升目。**この対応で丸ごと置き換える**（部分更新ではない）。 */
  placements: Record<string, { column: number; row: number }>;
  spacing?: { columnGap?: number; nodeWidth?: number; rowGap?: number; nodeHeight?: number };
}

/**
 * 配置差分だけを書き換える。図の中身（人物・家族）には触らない。
 *
 * 保存の入口と**同じ検証**を通す（升目の重なり・件数の上限・刻みの範囲）。画面から保存したときと
 * 判定が違うと、MCP で書いた図だけが画面で開けない状態になる。
 */
export async function setDiagramLayout(
  input: SetDiagramLayoutInput,
  rootDir: string,
): Promise<{ path: string; placements: number }> {
  validateDiagramExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const document = await readDiagram({ path: input.path }, rootDir);
  const validated = validateDiagramLayout({
    placements: input.placements,
    ...(input.spacing === undefined ? {} : { spacing: input.spacing }),
  });
  if (!validated.ok) throw new Error(validated.errors.join('\n'));
  const next: DiagramDocument = { ...document, layout: validated.layout };
  await fs.writeFile(filePath, serializeDiagramDocument(next), 'utf-8');
  return { path: input.path, placements: Object.keys(validated.layout.placements).length };
}

/**
 * 既存ファイルの配置差分。ファイルが**無いとき**だけ空を返す（新規作成）。
 *
 * 壊れて読めないファイルは throw で止める。空へ倒すと、読めないだけのファイルへ書き込んだ
 * 瞬間に整えた配置がまるごと消え、失敗は 1 件も記録に残らない。
 */
async function existingLayout(relativePath: string, rootDir: string): Promise<DiagramLayout> {
  try {
    return (await readDiagram({ path: relativePath }, rootDir)).layout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return EMPTY_DIAGRAM_LAYOUT;
    throw error;
  }
}
