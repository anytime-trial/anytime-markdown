import fs from 'node:fs';
import path from 'node:path';

import type { C4Element } from '@anytime-markdown/trail-core';
import type Database from 'better-sqlite3';

import { type DbLogger, noopDbLogger } from './DbLogger';

export interface WorkspaceC4ElementProviderOptions {
  readonly workspaceRoot: string;
  /** 省略時はワークスペースルートのディレクトリ名 */
  readonly repoName?: string;
  /** 手動 C4 要素（c4_manual_elements）をマージする場合のみ渡す */
  readonly db?: Database.Database;
  readonly packagesDirName?: string;
  readonly logger?: DbLogger;
}

interface RepoRow {
  readonly repo_id: number;
}

interface ManualElementRow {
  readonly element_id: string;
  readonly type: string | null;
  readonly name: string | null;
  readonly parent_id: string | null;
}

const DEFAULT_PACKAGES_DIR_NAME = 'packages';

/**
 * 設計書追随チェック用の C4 要素を供給する。
 *
 * 設計書の `c4Scope` は `pkg_<パッケージ名>` / `sys_<リポジトリ名>` 形式で要素を指すが、
 * 手動 C4（`c4_manual_elements`）は実運用で 0 件であり、これだけに頼ると
 * `c4Mapper` が変更ファイルを 1 件も要素へ写像できない。そこでワークスペース構成
 * （`packages/<name>/package.json` の実在）から要素を決定論的に導出し、
 * 手動 C4 が存在する場合はそちらを優先してマージする。
 */
export class WorkspaceC4ElementProvider {
  private readonly workspaceRoot: string;
  private readonly repoName: string;
  private readonly db: Database.Database | undefined;
  private readonly packagesDirName: string;
  private readonly logger: DbLogger;
  private cached: readonly C4Element[] | null = null;

  constructor(options: WorkspaceC4ElementProviderOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.repoName = options.repoName ?? path.basename(options.workspaceRoot);
    this.db = options.db;
    this.packagesDirName = options.packagesDirName ?? DEFAULT_PACKAGES_DIR_NAME;
    this.logger = options.logger ?? noopDbLogger;
  }

  listElements(): readonly C4Element[] {
    if (this.cached) return this.cached;

    const elementsById = new Map<string, C4Element>();
    for (const element of this.deriveFromWorkspace()) {
      elementsById.set(element.id, element);
    }

    for (const element of this.loadManualElements()) {
      elementsById.set(element.id, element);
    }

    this.cached = [...elementsById.values()];
    return this.cached;
  }

  private deriveFromWorkspace(): readonly C4Element[] {
    const systemId = `sys_${this.repoName}`;
    const elements: C4Element[] = [
      { id: systemId, type: 'system', name: this.repoName },
    ];

    const packagesRoot = path.join(this.workspaceRoot, this.packagesDirName);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(packagesRoot, { withFileTypes: true });
    } catch (error) {
      this.logger.warn(`Failed to read packages directory: ${packagesRoot}: ${formatError(error)}`);
      return elements;
    }

    const packageNames = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => fs.existsSync(path.join(packagesRoot, name, 'package.json')))
      .sort((left, right) => left.localeCompare(right));

    for (const name of packageNames) {
      elements.push({
        id: `pkg_${name}`,
        type: 'container',
        name,
        boundaryId: systemId,
      });
    }

    return elements;
  }

  private loadManualElements(): readonly C4Element[] {
    if (!this.db) return [];

    const repoId = this.findRepoId(this.db);
    if (repoId === null) return [];

    let rows: ManualElementRow[];
    try {
      rows = this.db.prepare(`
        SELECT element_id, type, name, parent_id
        FROM c4_manual_elements
        WHERE repo_id = ?
      `).all(repoId) as ManualElementRow[];
    } catch (error) {
      this.logger.warn(`Failed to read manual C4 elements: ${formatError(error)}`);
      return [];
    }

    return rows.map((row) => {
      const element: C4Element = {
        id: row.element_id,
        type: row.type ?? 'container',
        name: row.name ?? row.element_id,
      };

      return row.parent_id ? { ...element, boundaryId: row.parent_id } : element;
    });
  }

  private findRepoId(db: Database.Database): number | null {
    try {
      const row = db.prepare('SELECT repo_id FROM repos WHERE repo_name = ?')
        .get(this.repoName) as RepoRow | undefined;
      if (row) return row.repo_id;

      this.logger.warn(`Repository not found in repos table, skipping manual C4 elements: ${this.repoName}`);
      return null;
    } catch (error) {
      this.logger.warn(`Failed to resolve repo_id for ${this.repoName}: ${formatError(error)}`);
      return null;
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
