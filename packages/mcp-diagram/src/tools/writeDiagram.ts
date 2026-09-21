import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type DiagramConnector,
  type DiagramDocument,
  type DiagramFamily,
  type DiagramAnchor,
  type DiagramGroupAxis,
  type DiagramShape,
  EMPTY_DIAGRAM_LAYOUT,
  validateDiagramDocument,
  readDiagramAnchor,
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
  /** 家族に属さない要素。省いたら**既存ファイルのものを引き継ぐ**（配置差分と同じ扱い）。 */
  nodes?: string[];
  /**
   * 手で引いた接続線。省いたら既存ファイルのものを引き継ぐ。
   *
   * 端（`from` / `to`）は**ファイルに書く形**で受ける（要素は文字列、線は `{ line: id }`、
   * 家族は `{ family: [親…] }`）。型の付いた端で受けると、MCP の呼び手が図の内部表現を
   * 知らないと線を 1 本も引けない。
   */
  connectors?: WriteDiagramConnector[];
  /** 要素ごとの形。省いたら既存ファイルのものを引き継ぐ（四角の要素は書かない）。 */
  shapes?: Record<string, DiagramShape>;
  annotations?: Record<string, string>;
}

/**
 * 系図を書く。**配置差分（`layout`）は引数に取らない。**
 *
 * 人物と家族を書き換える道具に配置まで持たせると、家族を 1 件足すだけの呼び出しが、渡し忘れた
 * 配置を空で上書きする。配置は `setDiagramLayout` が専任で扱い、ここでは**既存ファイルの配置を
 * そのまま引き継ぐ**。
 *
 * 要素（`nodes`）・接続線（`connectors`）・形（`shapes`）・注記（`annotations`）・群の軸（`groups`）と
 * 読み物（`lead` / `note` / `legend`）は**渡せるが、省いたら引き継ぐ**。画面で足したものを
 * 「家族を 1 件書き換えただけ」の呼び出しが消さないようにするため。
 */
/** 書き込み要求の中の接続線 1 本。端はファイルの形。 */
export type WriteDiagramConnector = Omit<DiagramConnector, 'from' | 'to'> & {
  from: unknown;
  to: unknown;
};

/** ファイルの形の端を型の付いた端へ。読めない端は**書かせない**（次に開けない図を作らない）。 */
function toAnchor(value: unknown, where: string): DiagramAnchor {
  const anchor = readDiagramAnchor(value);
  if (anchor === undefined) {
    throw new Error(`[diagram] connectors.${where} は要素名（文字列）か { line: id } か { family: [親…] } です`);
  }
  return anchor;
}

export async function writeDiagram(input: WriteDiagramInput, rootDir: string): Promise<{ path: string }> {
  validateDiagramExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const existing = await existingDocument(input.path, rootDir);
  const document: DiagramDocument = {
    version: 1,
    title: input.title,
    // 省いた項目は**既存ファイルから引き継ぐ**。空へ倒すと、「家族を 1 件足すだけ」の呼び出しが
    // 導入文・注記・凡例・群の軸を丸ごと落とす（どれも画面から編集する値で、消えても呼び手には
    // 何も返らない）。nodes / shapes / connectors と同じ扱いに揃える。
    lead: input.lead ?? existing?.lead ?? '',
    note: input.note ?? existing?.note ?? '',
    legend: input.legend ?? existing?.legend ?? '',
    groups: input.groups ?? existing?.groups ?? [],
    families: input.families,
    nodes: input.nodes ?? existing?.nodes ?? [],
    shapes: input.shapes ?? existing?.shapes ?? {},
    connectors: input.connectors === undefined
      ? existing?.connectors ?? []
      : input.connectors.map((connector) => ({
        ...connector,
        from: toAnchor(connector.from, 'from'),
        to: toAnchor(connector.to, 'to'),
      })),
    annotations: input.annotations ?? existing?.annotations ?? {},
    layout: existing?.layout ?? EMPTY_DIAGRAM_LAYOUT,
  };
  /*
    書く前に自分の読み取りを通す。通らない形を書くと、次に開いた画面が「読めません」になる。

    **理由は検証器が出したものをそのまま返す。** 断り文句を 1 つ決め打っていた頃は、線の id が
    重複しているだけの呼び出しにも「families か nodes に要素が 1 つ要ります」と答えており、
    呼び手（LLM を含む）は直しようのない修正を繰り返すことになっていた。拡張・web-app と
    同じ入口（`validateDiagramDocument`）を使うので、3 経路で同じ理由が出る。
  */
  const validated = validateDiagramDocument(JSON.parse(serializeDiagramDocument(document)));
  if (!validated.ok) throw new Error(validated.errors.join('\n'));
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
 * 既存ファイルの図。ファイルが**無いとき**だけ `null` を返す（新規作成）。
 *
 * 壊れて読めないファイルは throw で止める。空へ倒すと、読めないだけのファイルへ書き込んだ
 * 瞬間に整えた配置・要素・線がまるごと消え、失敗は 1 件も記録に残らない。
 */
async function existingDocument(relativePath: string, rootDir: string): Promise<DiagramDocument | null> {
  try {
    return await readDiagram({ path: relativePath }, rootDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null;
    throw error;
  }
}
