import fs from 'node:fs/promises';
import { formatMarkdown as engineFormat, type FormatWarning } from '@anytime-markdown/markdown-engine';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
import { assertNoLockViolation } from '../utils/sectionLockGuard';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface FormatMarkdownInput {
  path: string;
  /** "fix" = 整形して書き戻し（既定） / "check" = 書き換えず検出のみ */
  mode?: 'fix' | 'check';
}

export interface FormatMarkdownResult {
  /** 実際にファイルへ書き込んだか（check モードでは常に false） */
  changed: boolean;
  /** 整形が必要か（fix/check 共通。check で検出有無を判定するのに使う） */
  wouldChange: boolean;
  rulesApplied: Record<string, number>;
  warnings: FormatWarning[];
}

/**
 * markdown-check 規約への整形を in-place で実施する。
 * 返り値は差分サマリのみで本文を含めない（トークン削減が目的）。
 * fenced code block / frontmatter は不変・冪等。
 */
export async function formatMarkdownTool(
  input: FormatMarkdownInput,
  rootDir: string,
): Promise<FormatMarkdownResult> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const original = await fs.readFile(filePath, 'utf-8');

  const { result, rulesApplied, warnings } = engineFormat(original);
  const mode = input.mode ?? 'fix';
  const wouldChange = result !== original;

  if (mode === 'fix' && wouldChange) {
    assertNoLockViolation(original, result, input.path);
    await fs.writeFile(filePath, result, 'utf-8');
  }

  return {
    changed: mode === 'fix' ? wouldChange : false,
    wouldChange,
    rulesApplied,
    warnings,
  };
}
