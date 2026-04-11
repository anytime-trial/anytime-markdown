import * as vscode from 'vscode';

type C4NodeKind = 'c1' | 'c2' | 'c3' | 'c4';

const CONTEXT_VALUES: Record<C4NodeKind, string> = {
  c1: 'c4Level.c1',
  c2: 'c4Level',
  c3: 'c4Level',
  c4: 'c4Level.c4',
};

const LABELS: Record<C4NodeKind, string> = {
  c1: 'C1: System',
  c2: 'C2: Container',
  c3: 'C3: Component',
  c4: 'C4: Code',
};

const ICONS: Record<C4NodeKind, string> = {
  c1: 'globe',
  c2: 'package',
  c3: 'extensions',
  c4: 'file-code',
};

export class C4TreeItem extends vscode.TreeItem {
  constructor(public readonly kind: C4NodeKind) {
    super(LABELS[kind], vscode.TreeItemCollapsibleState.None);
    this.contextValue = CONTEXT_VALUES[kind];
    this.iconPath = new vscode.ThemeIcon(ICONS[kind]);
  }
}

const CHILDREN: readonly C4TreeItem[] = [
  new C4TreeItem('c1'),
  new C4TreeItem('c2'),
  new C4TreeItem('c3'),
  new C4TreeItem('c4'),
];

export class C4TreeProvider implements vscode.TreeDataProvider<C4TreeItem> {
  getTreeItem(element: C4TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: C4TreeItem): C4TreeItem[] {
    if (!element) return [...CHILDREN];
    return [];
  }
}
