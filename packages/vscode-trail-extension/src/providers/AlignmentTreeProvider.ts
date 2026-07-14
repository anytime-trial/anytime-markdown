import * as path from 'node:path';

import type { AlignmentFinding, AlignmentReport } from '@anytime-markdown/trail-core';
import * as vscode from 'vscode';

export type AlignmentNodeKind = 'element' | 'group' | 'spec' | 'file' | 'message';

export interface AlignmentNode {
  readonly kind: AlignmentNodeKind;
  readonly label: string;
  readonly description?: string;
  readonly children?: readonly AlignmentNode[];
  /** spec / file ノードが開くファイルの絶対パス */
  readonly resourcePath?: string;
  readonly status?: 'stale' | 'undocumented';
}

const ICON_BY_KIND: Record<AlignmentNodeKind, string> = {
  element: 'package',
  group: 'folder',
  spec: 'book',
  file: 'file-code',
  message: 'info',
};

/**
 * 設計書追随チェックの結果を Trail サイドバーのツリーとして出す。
 *
 * ルートは C4 要素。次にやることが「その要素の設計書を直すこと」なので、要素配下に
 * 「追随していない設計書」（クリックで設計書を開く）と「変更ファイル」を並べる。
 * 判定の実行は行わない（実行はコマンド側。結果を `update` で受け取る）。
 */
export class AlignmentTreeProvider implements vscode.TreeDataProvider<AlignmentNode> {
  private readonly changeEmitter = new vscode.EventEmitter<AlignmentNode | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private roots: readonly AlignmentNode[] = [];

  constructor(
    private readonly workspaceRoot: string,
    private readonly docsRepoRoot: string,
  ) {}

  update(report: AlignmentReport): void {
    this.roots = buildRoots(report, this.workspaceRoot, this.docsRepoRoot);
    this.changeEmitter.fire(undefined);
  }

  /** 判定に失敗した / まだ実行していない状態を 1 行で示す。 */
  showMessage(message: string): void {
    this.roots = [{ kind: 'message', label: message }];
    this.changeEmitter.fire(undefined);
  }

  getChildren(node?: AlignmentNode): AlignmentNode[] {
    return [...(node ? (node.children ?? []) : this.roots)];
  }

  getTreeItem(node: AlignmentNode): vscode.TreeItem {
    const collapsibleState = node.children?.length
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;

    const item = new vscode.TreeItem(node.label, collapsibleState);
    item.description = node.description;
    item.iconPath = new vscode.ThemeIcon(ICON_BY_KIND[node.kind]);
    item.contextValue = `alignment.${node.kind}`;

    if (node.resourcePath) {
      item.resourceUri = vscode.Uri.file(node.resourcePath);
      item.tooltip = node.resourcePath;
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [vscode.Uri.file(node.resourcePath)],
      };
    }

    return item;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}

function buildRoots(
  report: AlignmentReport,
  workspaceRoot: string,
  docsRepoRoot: string,
): readonly AlignmentNode[] {
  const byElement = new Map<string, AlignmentFinding[]>();
  for (const finding of report.findings) {
    if (finding.status === 'ok') continue;
    const findings = byElement.get(finding.elementId) ?? [];
    findings.push(finding);
    byElement.set(finding.elementId, findings);
  }

  if (byElement.size === 0) {
    return [
      {
        kind: 'message',
        label: '追随していない設計書はありません',
        description: `変更 ${report.checkedFiles} ファイル`,
      },
    ];
  }

  return [...byElement.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([elementId, findings]) => buildElementNode(elementId, findings, workspaceRoot, docsRepoRoot));
}

function buildElementNode(
  elementId: string,
  findings: readonly AlignmentFinding[],
  workspaceRoot: string,
  docsRepoRoot: string,
): AlignmentNode {
  const specPaths = [...new Set(
    findings.filter((f) => f.status === 'stale' && f.specPath).map((f) => f.specPath as string),
  )].sort((left, right) => left.localeCompare(right));
  const changedFiles = [...new Set(findings.flatMap((f) => f.changedFiles))]
    .sort((left, right) => left.localeCompare(right));
  const undocumented = findings.some((f) => f.status === 'undocumented');

  const children: AlignmentNode[] = [];

  if (specPaths.length > 0) {
    children.push({
      kind: 'group',
      label: '追随していない設計書',
      description: `${specPaths.length}`,
      children: specPaths.map((specPath) => ({
        kind: 'spec' as const,
        label: path.basename(specPath),
        description: path.dirname(specPath),
        resourcePath: path.join(docsRepoRoot, specPath),
        status: 'stale' as const,
      })),
    });
  }

  if (undocumented) {
    children.push({
      kind: 'message',
      label: 'この要素を c4Scope に持つ設計書がありません',
      status: 'undocumented',
    });
  }

  children.push({
    kind: 'group',
    label: '変更ファイル',
    description: `${changedFiles.length}`,
    children: changedFiles.map((filePath) => ({
      kind: 'file' as const,
      label: path.basename(filePath),
      description: path.dirname(filePath),
      resourcePath: path.join(workspaceRoot, filePath),
    })),
  });

  return {
    kind: 'element',
    label: elementId,
    description: undocumented && specPaths.length === 0
      ? 'undocumented'
      : `stale ${specPaths.length}`,
    children,
  };
}
