// packages/trail-core/src/analyzer/__tests__/ExportExtractor.test.ts
import ts from 'typescript';
import { ExportExtractor } from '../ExportExtractor';

function createSourceFile(code: string): ts.SourceFile {
  return ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
}

describe('ExportExtractor', () => {
  it('export function を抽出する', () => {
    const src = createSourceFile(`
      export function login(user: string) { return user; }
      export const VERSION = '1.0';
    `);
    const result = ExportExtractor.extract([src], 'src/auth');
    // 純粋な定数（値のみ）はフローがないためスキップされる
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'login',
      kind: 'function',
      filePath: 'test.ts',
    });
  });

  it('export class のメソッドを抽出する', () => {
    const src = createSourceFile(`
      export class AuthService {
        login(user: string) { return user; }
        private _helper() {}
      }
    `);
    const result = ExportExtractor.extract([src], 'src/auth');
    // AuthService 自体 + login メソッド（private は除外）
    expect(result.some(s => s.name === 'AuthService' && s.kind === 'class')).toBe(true);
    expect(result.some(s => s.name === 'login' && s.kind === 'method')).toBe(true);
    expect(result.some(s => s.name === '_helper')).toBe(false);
  });

  it('export でない宣言は除外する', () => {
    const src = createSourceFile(`
      function internal() {}
      export function publicFn() {}
    `);
    const result = ExportExtractor.extract([src], 'src');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('publicFn');
  });
});
