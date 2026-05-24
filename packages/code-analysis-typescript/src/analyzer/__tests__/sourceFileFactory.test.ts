import ts from 'typescript';
import { createSourceFile, findFunctionNode } from '../sourceFileFactory';

describe('sourceFileFactory', () => {
  describe('createSourceFile', () => {
    test('returns a SourceFile with the given file name and content', () => {
      const sf = createSourceFile('demo.ts', 'export const x = 1;');
      expect(sf.fileName).toBe('demo.ts');
      expect(sf.text).toBe('export const x = 1;');
      expect(sf.kind).toBe(ts.SyntaxKind.SourceFile);
    });
  });

  describe('findFunctionNode', () => {
    test('returns FunctionDeclaration by name', () => {
      const sf = createSourceFile('a.ts', `
        function foo(x: number): number { return x + 1; }
        function bar(): void {}
      `);
      const node = findFunctionNode(sf, 'foo');
      expect(node).toBeDefined();
      expect(ts.isFunctionDeclaration(node!)).toBe(true);
    });

    test('returns ArrowFunction inside const declaration', () => {
      const sf = createSourceFile('a.ts', 'export const arrow = (n: number) => n * 2;');
      const node = findFunctionNode(sf, 'arrow');
      expect(node).toBeDefined();
      expect(ts.isArrowFunction(node!)).toBe(true);
    });

    test('returns FunctionExpression inside const declaration', () => {
      const sf = createSourceFile('a.ts', 'const fe = function (n: number) { return n; };');
      const node = findFunctionNode(sf, 'fe');
      expect(node).toBeDefined();
      expect(ts.isFunctionExpression(node!)).toBe(true);
    });

    test('returns undefined when no function with the given name exists', () => {
      const sf = createSourceFile('a.ts', 'const x = 1;');
      expect(findFunctionNode(sf, 'missing')).toBeUndefined();
    });

    test('ignores variable declarations whose initializer is not a function', () => {
      const sf = createSourceFile('a.ts', 'export const literal = 42;');
      expect(findFunctionNode(sf, 'literal')).toBeUndefined();
    });

    test('ignores function declarations that do not match the name', () => {
      const sf = createSourceFile('a.ts', 'function foo() {}');
      expect(findFunctionNode(sf, 'bar')).toBeUndefined();
    });

    test('handles destructured variable declarations without crashing', () => {
      const sf = createSourceFile('a.ts', 'const { a, b } = obj;');
      expect(findFunctionNode(sf, 'a')).toBeUndefined();
    });
  });
});
