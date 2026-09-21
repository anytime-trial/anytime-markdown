import fs from 'node:fs/promises';

import { type DiagramDocument,parseDiagramFileStrict } from '@anytime-markdown/diagram-core';

import { resolveSecurePath, validateDiagramExtension } from '../utils/securePath.js';

export interface ReadDiagramInput {
  path: string;
}

/**
 * 系図を読む。**厳格版**で読むのは、読んだ結果をそのまま書き戻す使い方を想定しているため。
 *
 * 寛容版（壊れた値を空へ倒す）で読むと、それを土台に書き戻したときに保存済みの配置が
 * 1 回の書き込みで消える。
 */
export async function readDiagram(input: ReadDiagramInput, rootDir: string): Promise<DiagramDocument> {
  validateDiagramExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  return parseDiagramFileStrict(await fs.readFile(filePath, 'utf-8'));
}
