import * as ts from 'typescript';
import type { DecisionComment } from './analyzeChildProtocol';

/**
 * WHY / RATIONALE / 理由 接頭辞にマッチする。i=大小無視, 行頭の `:` / `：` 両対応。
 * （memory-core/extractComments.ts から移設。挙動を変えないこと）
 */
const COMMENT_PATTERN = /(?:WHY|RATIONALE|理由)\s*[:：]\s*(.+)/i;

/** コメントの外側デリミタを除去して内側テキストを返す。 */
function commentInnerText(raw: string, kind: ts.SyntaxKind): string {
  if (kind === ts.SyntaxKind.SingleLineCommentTrivia) {
    return raw.replace(/^\/\/\s?/, '').trim();
  }
  return raw
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, ''))
    .join('\n')
    .trim();
}

/** node が宣言するシンボル名を取得（無ければ null）。 */
function namedNodeIdent(node: ts.Node): string | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) {
    return node.name?.text ?? null;
  }
  if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) {
    const name = node.name;
    if (ts.isIdentifier(name)) return name.text;
    return null;
  }
  if (ts.isVariableStatement(node)) {
    const decls = node.declarationList.declarations;
    if (decls.length > 0 && ts.isIdentifier(decls[0].name)) {
      return decls[0].name.text;
    }
    return null;
  }
  return null;
}

/**
 * ts.Program の全ソースを走査し、`WHY:` / `RATIONALE:` / `理由:` の leading comment を
 * `DecisionComment[]` として抽出する純粋関数。DB 書込・memory 依存を持たないため
 * analyze-child（typescript 同梱）からそのまま呼べる。
 *
 * memory-core/extractComments.ts の走査部を切り出したもの。memory 側の ingest
 * （Decision entity / edge への変換）は ingestDecisionComments に残す。
 *
 * @param program analyzeWithProgram が構築した ts.Program
 * @param rootDir 相対パス化の基準（リポジトリルート）
 */
export function scanDecisionComments(program: ts.Program, rootDir: string): DecisionComment[] {
  const normalizedRoot = rootDir.replaceAll('\\', '/').replace(/\/$/, '');

  function toRelPath(absPath: string): string {
    const normalized = absPath.replaceAll('\\', '/');
    if (normalized.startsWith(normalizedRoot + '/')) {
      return normalized.slice(normalizedRoot.length + 1);
    }
    if (normalized === normalizedRoot) return '.';
    return absPath;
  }

  const out: DecisionComment[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const relFilePath = toRelPath(sourceFile.fileName);
    if (sourceFile.isDeclarationFile) continue;
    if (relFilePath.includes('node_modules')) continue;

    const sourceText = sourceFile.getFullText();
    const seenCommentPositions = new Set<number>();

    function processCommentRange(range: ts.CommentRange, node: ts.Node): void {
      if (seenCommentPositions.has(range.pos)) return;
      seenCommentPositions.add(range.pos);

      const raw = sourceText.slice(range.pos, range.end);
      const inner = commentInnerText(raw, range.kind);
      const match = COMMENT_PATTERN.exec(inner);
      if (!match) return;

      const text = match[1].trim();
      if (!text) return;

      const { line: lineZero } = sourceFile.getLineAndCharacterOfPosition(range.pos);
      out.push({
        filePath: relFilePath,
        line: lineZero + 1,
        text,
        symbolName: namedNodeIdent(node),
      });
    }

    function visit(node: ts.Node): void {
      const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];
      for (const range of commentRanges) processCommentRange(range, node);
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return out;
}
