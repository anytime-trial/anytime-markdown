/**
 * frontmatter（related/status/tags 等）を本文を読まずに取得・更新するツール。
 * 解析・直列化は gray-matter（doc-core と同 4.0.3）。更新は atomic write（tmp+rename）で本文を非破壊。
 */

import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface GetFrontmatterInput {
  path: string;
}

export interface UpdateFrontmatterInput {
  path: string;
  /** マージするキー（既存値を上書き）。 */
  set?: Record<string, unknown>;
  /** 削除するキー。 */
  removeKeys?: string[];
}

/** frontmatter の data（YAML パース結果）のみを返す。本文は読み込むが返さない。 */
export async function getFrontmatter(
  input: GetFrontmatterInput,
  rootDir: string,
): Promise<Record<string, unknown>> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  return matter(content).data as Record<string, unknown>;
}

/**
 * frontmatter を更新する（set をマージ・removeKeys を削除）。本文は非破壊。
 * frontmatter が無いファイルには新規付与する。
 */
export async function updateFrontmatter(input: UpdateFrontmatterInput, rootDir: string): Promise<void> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(content);
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };

  if (input.set) {
    for (const [k, v] of Object.entries(input.set)) data[k] = v;
  }
  if (input.removeKeys) {
    for (const k of input.removeKeys) delete data[k];
  }

  const next = matter.stringify(parsed.content, data);
  // atomic write: 同一ディレクトリの tmp に書いて rename（部分書込みでの破損を防ぐ）。
  const tmp = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmp, next, 'utf-8');
  await fs.rename(tmp, filePath);
}
