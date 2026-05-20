import * as ts from 'typescript';
import path from 'node:path';

export type FileCategory = 'ui' | 'logic' | 'excluded';

const TEST_FILE_RE = /\.(test|spec)\.tsx?$/;
const STORIES_FILE_RE = /\.stories\.tsx?$/;
const REACTISH_EXT_RE = /\.(tsx|jsx)$/;
const CUSTOM_HOOK_RE = /^use[A-Z][a-zA-Z0-9]*\.tsx?$/;
const PANEL_FILE_RE = /Panel\.ts$/;

const UI_IMPORT_PATTERNS: readonly RegExp[] = [
  /^react(\/.*)?$/,
  /^prosemirror-/,
  /^@tiptap\//,
];

const VSCODE_IMPORT_RE = /^vscode$/;

/**
 * ファイルを UI / Logic / 集計除外 のいずれかに分類する。
 *
 * - 集計除外: テスト / Stories / 型定義のみのファイル
 * - UI: View または View に強く結合したロジック (.tsx, react import, custom hook,
 *   ProseMirror Plugin, TipTap Extension, VS Code Webview Panel, theme, i18n)
 * - Logic: 上記いずれにも該当しない
 *
 * sourceFile を渡すと AST ベースの判定 (import 元 / 型のみ判定) を実行する。
 * 渡さない場合はファイル名ベースのみで判定する。
 */
export function classifyFile(filePath: string, sourceFile?: ts.SourceFile): FileCategory {
  const normalized = filePath.replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);

  // 1. 集計除外 (filename-based)
  if (TEST_FILE_RE.test(basename)) return 'excluded';
  if (STORIES_FILE_RE.test(basename)) return 'excluded';

  // 2. 集計除外 (型定義のみ、AST 必須)
  if (sourceFile && isTypeOnlyModule(sourceFile)) return 'excluded';

  // 3. UI (拡張子)
  if (REACTISH_EXT_RE.test(basename)) return 'ui';

  // 4. UI (custom hook 命名)
  if (CUSTOM_HOOK_RE.test(basename)) return 'ui';

  // 5. UI (theme / i18n パス)
  if (basename === 'theme.ts' || /\/theme\/[^/]+\.tsx?$/.test(normalized)) return 'ui';
  if (/\/i18n\/[^/]+\.tsx?$/.test(normalized)) return 'ui';

  // 6. UI (AST imports)
  if (sourceFile) {
    const imports = extractImportSources(sourceFile);
    if (imports.some((s) => UI_IMPORT_PATTERNS.some((p) => p.test(s)))) {
      return 'ui';
    }
    // VS Code Webview Panel: *Panel.ts かつ vscode import
    if (PANEL_FILE_RE.test(basename) && imports.some((s) => VSCODE_IMPORT_RE.test(s))) {
      return 'ui';
    }
  }

  return 'logic';
}

function extractImportSources(sourceFile: ts.SourceFile): string[] {
  const imports: string[] = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      imports.push(stmt.moduleSpecifier.text);
    }
  }
  return imports;
}

/**
 * モジュールが型定義のみで構成されているか判定する。
 *
 * - true 条件: 何らかの top-level statement があり、かつ value export が一つもない
 * - false 条件: 1 つでも値レベルの export (const / function / class / enum) がある、
 *   または値再エクスポート (`export { ... }` の type-only でないもの) がある
 */
function isTypeOnlyModule(sourceFile: ts.SourceFile): boolean {
  let hasValueExport = false;
  let hasAnyStatement = false;

  for (const stmt of sourceFile.statements) {
    hasAnyStatement = true;
    if (isValueStatement(stmt)) {
      hasValueExport = true;
    }
  }

  return hasAnyStatement && !hasValueExport;
}

/** Returns true if the statement contributes a runtime value (not type-only). */
function isValueStatement(stmt: ts.Statement): boolean {
  // import 文は value export とは無関係 (副作用 import も除外側に倒す)
  if (ts.isImportDeclaration(stmt)) return false;

  // 型のみの宣言
  if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) return false;

  // export type { X } / export { type X } はスキップ
  // export { foo } / export * from 'x' は値の再エクスポートとして扱う
  if (ts.isExportDeclaration(stmt)) return !stmt.isTypeOnly;

  // 値レベル宣言: export 修飾子の有無に関わらず副作用 (export なしも値とみなす)
  if (
    ts.isVariableStatement(stmt) ||
    ts.isFunctionDeclaration(stmt) ||
    ts.isClassDeclaration(stmt) ||
    ts.isEnumDeclaration(stmt)
  ) {
    return true;
  }

  // その他のトップレベル statement (ExpressionStatement 等) は副作用扱い
  return true;
}
