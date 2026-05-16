import * as ts from 'typescript';
import { classifyFile } from '../classifyFile';

function makeSourceFile(code: string, fileName = 'foo.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
}

describe('classifyFile', () => {
  describe('ui (extension)', () => {
    it('.tsx extension', () => {
      expect(classifyFile('packages/foo/src/MyComponent.tsx', makeSourceFile('export const x = 1;'))).toBe('ui');
    });

    it('.jsx extension', () => {
      expect(classifyFile('packages/foo/src/Legacy.jsx', makeSourceFile('export const x = 1;'))).toBe('ui');
    });
  });

  describe('ui (imports)', () => {
    it('imports react', () => {
      const sf = makeSourceFile(`import React from 'react'; export const Foo = () => null;`);
      expect(classifyFile('packages/foo/src/Wrapper.ts', sf)).toBe('ui');
    });

    it('imports react/jsx-runtime', () => {
      const sf = makeSourceFile(`import { jsx } from 'react/jsx-runtime'; export const Foo = () => null;`);
      expect(classifyFile('packages/foo/src/Wrapper.ts', sf)).toBe('ui');
    });

    it('imports prosemirror-state', () => {
      const sf = makeSourceFile(`import { Plugin } from 'prosemirror-state'; export const fooPlugin = new Plugin({});`);
      expect(classifyFile('packages/foo/src/blockAlignment.ts', sf)).toBe('ui');
    });

    it('imports @tiptap/core', () => {
      const sf = makeSourceFile(`import { Extension } from '@tiptap/core'; export const Foo = Extension.create({});`);
      expect(classifyFile('packages/foo/src/MyExtension.ts', sf)).toBe('ui');
    });
  });

  describe('ui (custom hook by filename)', () => {
    it('useFoo.ts', () => {
      const sf = makeSourceFile(`export const useFoo = () => 1;`);
      expect(classifyFile('packages/foo/src/useFoo.ts', sf)).toBe('ui');
    });

    it('useEditorState.ts', () => {
      const sf = makeSourceFile(`export const useEditorState = () => null;`);
      expect(classifyFile('packages/foo/src/hooks/useEditorState.ts', sf)).toBe('ui');
    });

    it('useless.ts (lowercase after use) → logic', () => {
      const sf = makeSourceFile(`export const useless = 1;`);
      expect(classifyFile('packages/foo/src/useless.ts', sf)).toBe('logic');
    });
  });

  describe('ui (Webview Panel + vscode import)', () => {
    it('TrailPanel.ts importing vscode', () => {
      const sf = makeSourceFile(`import * as vscode from 'vscode'; export class TrailPanel {}`);
      expect(classifyFile('packages/foo/src/TrailPanel.ts', sf)).toBe('ui');
    });

    it('Panel.ts without vscode import → logic', () => {
      const sf = makeSourceFile(`export class FooPanel {}`);
      expect(classifyFile('packages/foo/src/FooPanel.ts', sf)).toBe('logic');
    });
  });

  describe('ui (theme / i18n by path)', () => {
    it('theme.ts at any depth', () => {
      const sf = makeSourceFile(`export const theme = {};`);
      expect(classifyFile('packages/foo/src/theme.ts', sf)).toBe('ui');
    });

    it('theme/c4Tokens.ts', () => {
      const sf = makeSourceFile(`export const tokens = {};`);
      expect(classifyFile('packages/foo/src/theme/c4Tokens.ts', sf)).toBe('ui');
    });

    it('i18n/ja.ts', () => {
      const sf = makeSourceFile(`export const ja = { hello: 'こんにちは' };`);
      expect(classifyFile('packages/foo/src/i18n/ja.ts', sf)).toBe('ui');
    });

    it('i18n/en.ts', () => {
      const sf = makeSourceFile(`export const en = { hello: 'Hello' };`);
      expect(classifyFile('packages/foo/src/i18n/en.ts', sf)).toBe('ui');
    });
  });

  describe('logic', () => {
    it('plain util without UI imports', () => {
      const sf = makeSourceFile(`import path from 'node:path'; export const join = path.join;`);
      expect(classifyFile('packages/foo/src/utils.ts', sf)).toBe('logic');
    });

    it('domain logic without imports', () => {
      const sf = makeSourceFile(`export const compute = (n: number) => n * 2;`);
      expect(classifyFile('packages/foo/src/domain/compute.ts', sf)).toBe('logic');
    });

    it('class importing only ts std libs', () => {
      const sf = makeSourceFile(`import fs from 'node:fs'; export class FileWriter {}`);
      expect(classifyFile('packages/foo/src/FileWriter.ts', sf)).toBe('logic');
    });
  });

  describe('excluded (test / stories)', () => {
    it('*.test.ts', () => {
      expect(classifyFile('packages/foo/src/__tests__/x.test.ts', makeSourceFile(''))).toBe('excluded');
    });

    it('*.test.tsx', () => {
      expect(classifyFile('packages/foo/src/__tests__/x.test.tsx', makeSourceFile(''))).toBe('excluded');
    });

    it('*.spec.ts', () => {
      expect(classifyFile('packages/foo/src/x.spec.ts', makeSourceFile(''))).toBe('excluded');
    });

    it('*.stories.tsx', () => {
      expect(classifyFile('packages/foo/src/Foo.stories.tsx', makeSourceFile(''))).toBe('excluded');
    });
  });

  describe('excluded (type-only)', () => {
    it('only interface and type', () => {
      const sf = makeSourceFile(`export interface Foo { x: number; }\nexport type Bar = string;`);
      expect(classifyFile('packages/foo/src/types.ts', sf)).toBe('excluded');
    });

    it('only import type + type re-export', () => {
      const sf = makeSourceFile(`import type { Foo } from './foo';\nexport type Bar = Foo;`);
      expect(classifyFile('packages/foo/src/types.ts', sf)).toBe('excluded');
    });

    it('export type { X } only', () => {
      const sf = makeSourceFile(`export type { Foo } from './foo';`);
      expect(classifyFile('packages/foo/src/types.ts', sf)).toBe('excluded');
    });

    it('mixed type + value export → not excluded', () => {
      const sf = makeSourceFile(`export interface Foo { x: number; }\nexport const FOO_DEFAULT: Foo = { x: 0 };`);
      // Has value export, so not excluded. Plain logic.
      expect(classifyFile('packages/foo/src/foo.ts', sf)).toBe('logic');
    });
  });

  describe('without sourceFile (filename-only fallback)', () => {
    it('.tsx → ui', () => {
      expect(classifyFile('packages/foo/src/MyComponent.tsx')).toBe('ui');
    });

    it('useFoo.ts → ui', () => {
      expect(classifyFile('packages/foo/src/useFoo.ts')).toBe('ui');
    });

    it('theme/c4Tokens.ts → ui', () => {
      expect(classifyFile('packages/foo/src/theme/c4Tokens.ts')).toBe('ui');
    });

    it('plain .ts → logic', () => {
      expect(classifyFile('packages/foo/src/utils.ts')).toBe('logic');
    });

    it('*.test.ts → excluded', () => {
      expect(classifyFile('packages/foo/src/__tests__/x.test.ts')).toBe('excluded');
    });
  });

  describe('precedence', () => {
    it('test extension beats UI import (excluded wins)', () => {
      const sf = makeSourceFile(`import React from 'react'; describe('x', () => {});`);
      expect(classifyFile('packages/foo/src/__tests__/x.test.tsx', sf)).toBe('excluded');
    });

    it('type-only beats UI imports (excluded wins)', () => {
      const sf = makeSourceFile(`import type { ReactNode } from 'react';\nexport type Foo = ReactNode;`);
      expect(classifyFile('packages/foo/src/types.ts', sf)).toBe('excluded');
    });

    it('useXxx.tsx → ui (extension wins, both rules agree)', () => {
      expect(classifyFile('packages/foo/src/useFoo.tsx', makeSourceFile(''))).toBe('ui');
    });
  });

  describe('Windows path normalization', () => {
    it('handles backslash separators', () => {
      const sf = makeSourceFile(`export const ja = {};`);
      expect(classifyFile('packages\\foo\\src\\i18n\\ja.ts', sf)).toBe('ui');
    });
  });
});
