import * as path from 'node:path';

import type { AlignmentReport, AlignmentStatus } from '@anytime-markdown/trail-core';
import * as vscode from 'vscode';

export interface AlignmentDiagnosticsSummary {
  readonly checkedFiles: number;
  /** 追随していない設計書の実数（重複排除後） */
  readonly staleSpecs: number;
  /** 追随していない設計書を持つ C4 要素の数 */
  readonly staleElements: number;
  /** 設計書がまったく無い C4 要素の数 */
  readonly undocumentedElements: number;
}

interface FindingGroup {
  readonly status: AlignmentStatus;
  readonly elementId: string;
  readonly specPaths: string[];
}

const DIAGNOSTIC_SOURCE = 'Anytime Trail';
const MAX_LISTED_SPECS = 3;

/**
 * 設計書追随チェック（CheckArchitecturalAlignment）の結果を Problems パネルへ出す。
 *
 * 診断は「変更されたコードファイル」に付ける。設計書側に付けると、開発者が開いていない
 * ファイルに警告が溜まって気づけないため。
 *
 * 1 つの C4 要素を `c4Scope` に持つ設計書は多数ある（実測で `pkg_trail-core` は 13 本）。
 * finding をそのまま診断にすると 1 ファイルに十数件並んでパネルが埋まるので、
 * ファイル × 要素で束ね、設計書は先頭数本＋残数で示す。
 */
export class AlignmentDiagnosticsProvider implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;

  constructor(private readonly workspaceRoot: string) {
    this.collection = vscode.languages.createDiagnosticCollection('anytimeTrailAlignment');
  }

  render(report: AlignmentReport): AlignmentDiagnosticsSummary {
    const groupsByFile = new Map<string, Map<string, FindingGroup>>();
    const staleSpecs = new Set<string>();
    const staleElements = new Set<string>();
    const undocumentedElements = new Set<string>();

    for (const finding of report.findings) {
      if (finding.status === 'ok') continue;

      if (finding.status === 'stale') {
        staleElements.add(finding.elementId);
        if (finding.specPath) staleSpecs.add(finding.specPath);
      } else {
        undocumentedElements.add(finding.elementId);
      }

      for (const changedFile of finding.changedFiles) {
        const groups = groupsByFile.get(changedFile) ?? new Map<string, FindingGroup>();
        const key = `${finding.status}::${finding.elementId}`;
        const group = groups.get(key) ?? { status: finding.status, elementId: finding.elementId, specPaths: [] };
        if (finding.specPath) group.specPaths.push(finding.specPath);
        groups.set(key, group);
        groupsByFile.set(changedFile, groups);
      }
    }

    this.collection.clear();
    for (const [filePath, groups] of groupsByFile) {
      const diagnostics = [...groups.values()].map((group) => toDiagnostic(group));
      this.collection.set(vscode.Uri.file(path.join(this.workspaceRoot, filePath)), diagnostics);
    }

    return {
      checkedFiles: report.checkedFiles,
      staleSpecs: staleSpecs.size,
      staleElements: staleElements.size,
      undocumentedElements: undocumentedElements.size,
    };
  }

  clear(): void {
    this.collection.clear();
  }

  dispose(): void {
    this.collection.dispose();
  }
}

function toDiagnostic(group: FindingGroup): vscode.Diagnostic {
  const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
  const diagnostic = new vscode.Diagnostic(range, buildMessage(group), toSeverity(group.status));
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = `alignment.${group.status}`;
  return diagnostic;
}

function buildMessage(group: FindingGroup): string {
  if (group.status === 'undocumented') {
    return `${group.elementId} を c4Scope に持つ設計書がありません。この領域は設計書に記載されていません。`;
  }

  const listed = group.specPaths.slice(0, MAX_LISTED_SPECS).join(', ');
  const rest = group.specPaths.length - MAX_LISTED_SPECS;
  const suffix = rest > 0 ? ` ほか ${rest} 本` : '';
  return `${group.elementId} の設計書 ${group.specPaths.length} 本が追随していません: ${listed}${suffix}`;
}

function toSeverity(status: AlignmentStatus): vscode.DiagnosticSeverity {
  return status === 'stale'
    ? vscode.DiagnosticSeverity.Warning
    : vscode.DiagnosticSeverity.Information;
}
