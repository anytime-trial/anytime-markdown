import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import { scanDecisionComments } from '../scanDecisionComments';

// memory-core/extractComments.test.ts から移設した AST 走査の検証。
// ts.Program 上の WHY/RATIONALE/理由 コメントを正しく抽出するか確認する。

function makeProgram(source: string, filename = 'fixture.ts'): { program: ts.Program; rootDir: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-dc-'));
  const filePath = path.join(rootDir, filename);
  fs.writeFileSync(filePath, source, 'utf-8');
  const program = ts.createProgram([filePath], {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
  });
  return { program, rootDir };
}

describe('scanDecisionComments', () => {
  it('SC-1: 単一行 // WHY: コメントを抽出し、相対パス・行・シンボル名を返す', () => {
    // 宣言の直前（ファイル先頭でない）に置くと leading comment が当該宣言に付き symbol 名が取れる。
    const { program, rootDir } = makeProgram(`
export const _x = 0;
// WHY: ロジック A の理由
export function myFunc() {
  return 42;
}
`);
    const out = scanDecisionComments(program, rootDir);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('ロジック A の理由');
    expect(out[0].filePath).toBe('fixture.ts');
    expect(out[0].symbolName).toBe('myFunc');
    expect(out[0].line).toBeGreaterThan(0);
  });

  it('SC-2: 複数行 /* RATIONALE: */ コメントを抽出する', () => {
    const { program, rootDir } = makeProgram(`
/*
 * RATIONALE: This design decision was made for clarity
 */
export const value = 1;
`);
    const out = scanDecisionComments(program, rootDir);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('This design decision was made');
  });

  it('SC-3: 理由: 接頭辞（全角コロン）を抽出する', () => {
    const { program, rootDir } = makeProgram(`
// 理由：パフォーマンス向上のため
export function f() {}
`);
    const out = scanDecisionComments(program, rootDir);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('パフォーマンス向上のため');
  });

  it('SC-4: 複数コメントをすべて抽出する', () => {
    const { program, rootDir } = makeProgram(`
// WHY: reason a
export function a() {}
// WHY: reason b
export function b() {}
// RATIONALE: reason c
export class C {}
`);
    const out = scanDecisionComments(program, rootDir);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.text).sort()).toEqual(['reason a', 'reason b', 'reason c']);
  });

  it('SC-5: マッチしないコメントは抽出しない', () => {
    const { program, rootDir } = makeProgram(`
// just a normal comment
export function f() {}
`);
    const out = scanDecisionComments(program, rootDir);
    expect(out).toHaveLength(0);
  });

  it('SC-6: 同一コメント位置を重複抽出しない', () => {
    const { program, rootDir } = makeProgram(`
// WHY: single reason
export function outer() {
  function inner() {}
  return inner;
}
`);
    const out = scanDecisionComments(program, rootDir);
    expect(out.filter((c) => c.text === 'single reason')).toHaveLength(1);
  });
});
