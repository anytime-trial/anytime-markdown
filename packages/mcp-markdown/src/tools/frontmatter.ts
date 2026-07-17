/**
 * frontmatter（related/status/tags 等）を本文を読まずに取得・更新するツール。
 * 解析・直列化は gray-matter（doc-core と同 4.0.3）。更新は atomic write（tmp+rename）で本文を非破壊。
 */

import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
import { assertNoLockViolation } from '../utils/sectionLockGuard';

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

/** update_frontmatter の実施サマリ（何を set/削除したかを本文なしで検証できるようにする）。 */
export interface UpdateFrontmatterSummary {
  path: string;
  /** set でマージしたキー。 */
  setKeys: string[];
  /** 実在して削除されたキーのみ（存在しなかった removeKeys は含めない）。 */
  removedKeys: string[];
  /** frontmatter が無く新規付与した場合 true。 */
  createdFrontmatter: boolean;
}

/**
 * frontmatter を更新する（set をマージ・removeKeys を削除）。本文は非破壊。
 * frontmatter が無いファイルには新規付与する。
 */
export async function updateFrontmatter(
  input: UpdateFrontmatterInput,
  rootDir: string,
): Promise<UpdateFrontmatterSummary> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  // lockedSections は人間（エディタ）だけが管理する。削除・改変は assertNoLockViolation でも
  // 検出されるが、ロックが無いファイルへの偽造追加はエントリ走査では捕まらないため、
  // キー単位で一律拒否する（cross-review 補足指摘の採用。PreToolUse ゲートと同じ方針）。
  if (
    Object.hasOwn(input.set ?? {}, 'lockedSections') ||
    (input.removeKeys ?? []).includes('lockedSections')
  ) {
    throw new Error(
      `Section lock violation in ${input.path}: the lockedSections frontmatter is managed by humans via the Anytime Markdown editor and cannot be changed through update_frontmatter.`,
    );
  }
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(content);
  const hadFrontmatter = matter.test(content);
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };

  const setKeys: string[] = [];
  const removedKeys: string[] = [];
  if (input.set) {
    for (const [k, v] of Object.entries(input.set)) {
      data[k] = v;
      setKeys.push(k);
    }
  }
  if (input.removeKeys) {
    for (const k of input.removeKeys) {
      if (k in data) {
        delete data[k];
        removedKeys.push(k);
      }
    }
  }

  const next = matter.stringify(parsed.content, data);
  assertNoLockViolation(content, next, input.path);
  // atomic write: 同一ディレクトリの tmp に書いて rename（部分書込みでの破損を防ぐ）。
  // tmp 名は UUID で一意化（単一プロセス内の同一ファイル並行更新でも衝突しない）。
  const tmp = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(tmp, next, 'utf-8');
  await fs.rename(tmp, filePath);
  return { path: input.path, setKeys, removedKeys, createdFrontmatter: !hadFrontmatter };
}
