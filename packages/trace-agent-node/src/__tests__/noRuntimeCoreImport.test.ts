import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * リグレッション: agent の実行時コードから `@anytime-markdown/trace-core` を**値として**
 * 参照してはいけない（`import type` のみ可）。
 *
 * trace-core は `main` / `exports` が TypeScript ソース（`src/index.ts`）を指す型専用パッケージで、
 * ビルド済み JS を持たない。値 import は `tsc` にも jest にも webpack にも通るが、
 * 実際の起動経路 `node --require @anytime-markdown/trace-agent-node`（CodeLens の Trace 起動）
 * だけが `ERR_MODULE_NOT_FOUND` で落ちる。ユニットも型検査も緑のまま出荷される形の欠陥。
 *
 * 判定は AST で行う。行単位の文字列判定では複数行 named import
 * （パッケージ名が `} from '...'` の行に来る）や `require()` / 動的 import を取りこぼす。
 */
const SRC_DIR = path.join(__dirname, '..');
const FORBIDDEN_PREFIX = '@anytime-markdown/trace-core';

function collectSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // テストは ts-jest 上でのみ動き `node --require` 経路に乗らないため対象外。
            if (entry.name === '__tests__') continue;
            out.push(...collectSourceFiles(full));
            continue;
        }
        if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

function isForbiddenSpecifier(node: ts.Node): boolean {
    return ts.isStringLiteralLike(node) && node.text.startsWith(FORBIDDEN_PREFIX);
}

/** import 宣言が完全に型専用か（`import type ...` または全 named binding が `type` 付き）。 */
function isTypeOnlyImport(decl: ts.ImportDeclaration): boolean {
    const clause = decl.importClause;
    if (!clause) return false; // side-effect import（`import '...'`）は値参照
    if (clause.isTypeOnly) return true;
    if (clause.name) return false; // default import は値
    const bindings = clause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false; // namespace import は値
    return bindings.elements.every((el) => el.isTypeOnly);
}

function findViolations(file: string): string[] {
    const text = fs.readFileSync(file, 'utf-8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const rel = path.relative(SRC_DIR, file);
    const violations: string[] = [];

    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && isForbiddenSpecifier(node.moduleSpecifier) && !isTypeOnlyImport(node)) {
            violations.push(`${rel}: value import of ${node.moduleSpecifier.getText(source)}`);
        }
        // require('...') / import('...') も実行時解決になる
        if (ts.isCallExpression(node)) {
            const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
            const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
            const arg = node.arguments[0];
            if ((isRequire || isDynamicImport) && arg && isForbiddenSpecifier(arg)) {
                violations.push(`${rel}: runtime ${isRequire ? 'require' : 'import()'} of ${arg.getText(source)}`);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return violations;
}

describe('trace-agent-node の実行時依存', () => {
    it('trace-core を値として参照しない（型 import のみ）', () => {
        const offenders = collectSourceFiles(SRC_DIR).flatMap(findViolations);
        expect(offenders).toEqual([]);
    });

    it('検出ロジック自体が値 import・複数行 import・require を捕まえる', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-guard-'));
        try {
            const cases: Record<string, string> = {
                'single.ts': `import { CURRENT_TRACE_VERSION } from '${FORBIDDEN_PREFIX}';\n`,
                'multiline.ts': `import {\n    CURRENT_TRACE_VERSION,\n} from '${FORBIDDEN_PREFIX}';\n`,
                'subpath.ts': `import { migrateTraceFile } from '${FORBIDDEN_PREFIX}/parse';\n`,
                'requireCall.ts': `const c = require('${FORBIDDEN_PREFIX}');\n`,
                'dynamic.ts': `async function f() { await import('${FORBIDDEN_PREFIX}'); }\n`,
                'namespace.ts': `import * as core from '${FORBIDDEN_PREFIX}';\n`,
            };
            for (const [name, code] of Object.entries(cases)) {
                const p = path.join(tmpDir, name);
                fs.writeFileSync(p, code, 'utf-8');
                expect(findViolations(p)).toHaveLength(1);
            }

            const allowed = path.join(tmpDir, 'typeonly.ts');
            fs.writeFileSync(allowed, `import type { TraceFile } from '${FORBIDDEN_PREFIX}';\nimport {\n    type JsonValue,\n} from '${FORBIDDEN_PREFIX}';\n`, 'utf-8');
            expect(findViolations(allowed)).toEqual([]);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
