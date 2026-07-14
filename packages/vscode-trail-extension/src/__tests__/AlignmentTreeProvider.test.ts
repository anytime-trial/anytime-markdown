import type { AlignmentReport } from '@anytime-markdown/trail-core';

import { AlignmentTreeProvider, type AlignmentNode } from '../providers/AlignmentTreeProvider';

const WORKSPACE_ROOT = '/anytime-markdown';
const DOCS_ROOT = '/Shared/anytime-markdown-docs';

function buildReport(findings: AlignmentReport['findings'], checkedFiles = 3): AlignmentReport {
  return { scope: 'worktree', checkedFiles, skippedMinor: 0, findings };
}

function createProvider(): AlignmentTreeProvider {
  return new AlignmentTreeProvider(WORKSPACE_ROOT, DOCS_ROOT);
}

function childrenOf(provider: AlignmentTreeProvider, node?: AlignmentNode): readonly AlignmentNode[] {
  return provider.getChildren(node);
}

describe('AlignmentTreeProvider', () => {
  it('groups findings under one node per C4 element, with specs and changed files below', () => {
    const provider = createProvider();
    provider.update(buildReport([
      {
        status: 'stale',
        elementId: 'pkg_trail-core',
        specPath: 'spec/31.trail/03.trail-core/trail-core.ja.md',
        changedFiles: ['packages/trail-core/src/a.ts'],
        reason: 'not updated',
      },
      {
        status: 'stale',
        elementId: 'pkg_trail-core',
        specPath: 'spec/00.requirements/trail-roadmap.ja.md',
        changedFiles: ['packages/trail-core/src/a.ts'],
        reason: 'not updated',
      },
      {
        status: 'stale',
        elementId: 'pkg_trail-db',
        specPath: 'spec/31.trail/06.trail-db/trail-db.ja.md',
        changedFiles: ['packages/trail-db/src/b.ts'],
        reason: 'not updated',
      },
    ]));

    const roots = childrenOf(provider);
    expect(roots.map((node) => [node.label, node.description])).toEqual([
      ['pkg_trail-core', 'stale 2'],
      ['pkg_trail-db', 'stale 1'],
    ]);

    const [specGroup, fileGroup] = childrenOf(provider, roots[0]);
    expect([specGroup.label, specGroup.description]).toEqual(['追随していない設計書', '2']);
    expect(childrenOf(provider, specGroup).map((node) => node.label)).toEqual([
      'trail-roadmap.ja.md',
      'trail-core.ja.md',
    ]);
    expect([fileGroup.label, fileGroup.description]).toEqual(['変更ファイル', '1']);
    expect(childrenOf(provider, fileGroup)[0].label).toBe('a.ts');
  });

  it('opens the spec document from the docs repository and the code file from the workspace', () => {
    const provider = createProvider();
    provider.update(buildReport([
      {
        status: 'stale',
        elementId: 'pkg_trail-db',
        specPath: 'spec/31.trail/06.trail-db/trail-db.ja.md',
        changedFiles: ['packages/trail-db/src/b.ts'],
        reason: 'not updated',
      },
    ]));

    const [element] = childrenOf(provider);
    const [specGroup, fileGroup] = childrenOf(provider, element);
    const specItem = provider.getTreeItem(childrenOf(provider, specGroup)[0]);
    const fileItem = provider.getTreeItem(childrenOf(provider, fileGroup)[0]);

    expect(specItem.command?.command).toBe('vscode.open');
    expect(specItem.resourceUri?.fsPath).toBe(
      '/Shared/anytime-markdown-docs/spec/31.trail/06.trail-db/trail-db.ja.md',
    );
    expect(fileItem.resourceUri?.fsPath).toBe('/anytime-markdown/packages/trail-db/src/b.ts');
  });

  it('marks elements that no spec document declares', () => {
    const provider = createProvider();
    provider.update(buildReport([
      {
        status: 'undocumented',
        elementId: 'pkg_new-package',
        specPath: null,
        changedFiles: ['packages/new-package/src/index.ts'],
        reason: 'no spec',
      },
    ]));

    const [element] = childrenOf(provider);
    expect(element.description).toBe('undocumented');
    expect(childrenOf(provider, element)[0].label).toBe(
      'この要素を c4Scope に持つ設計書がありません',
    );
  });

  it('shows a single row when nothing is stale', () => {
    const provider = createProvider();
    provider.update(buildReport([
      {
        status: 'ok',
        elementId: 'pkg_trail-db',
        specPath: 'spec/trail-db.ja.md',
        changedFiles: ['packages/trail-db/src/b.ts'],
        reason: 'updated',
      },
    ], 7));

    expect(childrenOf(provider).map((node) => [node.label, node.description])).toEqual([
      ['追随していない設計書はありません', '変更 7 ファイル'],
    ]);
  });

  it('replaces the previous result on the next update', () => {
    const provider = createProvider();
    provider.update(buildReport([
      {
        status: 'stale',
        elementId: 'pkg_trail-core',
        specPath: 'spec/a.md',
        changedFiles: ['packages/trail-core/src/a.ts'],
        reason: 'not updated',
      },
    ]));
    provider.update(buildReport([
      {
        status: 'stale',
        elementId: 'pkg_trail-db',
        specPath: 'spec/b.md',
        changedFiles: ['packages/trail-db/src/b.ts'],
        reason: 'not updated',
      },
    ]));

    expect(childrenOf(provider).map((node) => node.label)).toEqual(['pkg_trail-db']);
  });

  it('shows a message row when the check could not run', () => {
    const provider = createProvider();
    provider.showMessage('設計書リポジトリが未設定です');

    const roots = childrenOf(provider);
    expect(roots.map((node) => node.label)).toEqual(['設計書リポジトリが未設定です']);
    expect(provider.getTreeItem(roots[0]).command).toBeUndefined();
  });
});
