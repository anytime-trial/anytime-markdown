import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

import { fetchC4Model } from '@anytime-markdown/trail-core/c4';
import type { DocLink, FeatureMatrix } from '@anytime-markdown/trail-core/c4';
import type { IC4ModelStore } from '@anytime-markdown/trail-core';

import type { Logger } from '../runtime/Logger';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export interface DocsApiNotifier {
  /** docLinks 更新時に WebSocket 経由で 'doc-links-updated' を broadcast する */
  broadcastDocLinks(docLinks: readonly DocLink[]): void;
}

export interface DocsApiC4Resolver {
  /** /api/docs-index?repo=... のフィルタ用に C4 model から要素 ID 集合を構築する */
  getC4Store(): IC4ModelStore;
  getFeatureMatrix(): FeatureMatrix | undefined;
}

/**
 * `/api/c4/doc-links` `/api/docs-index` ハンドラ + docLinks 共有状態の管理。
 *
 * docLinks は `setDocsPath()` で初期化され、外部から `scan()` で再走査できる。
 * 値は HTTP ハンドラと、WebSocket 接続時の初回 sync 用に getCurrent() で参照可能。
 */
export class DocsApiHandler {
  private docLinks: readonly DocLink[] = [];
  private docsPath: string | undefined;

  constructor(
    private readonly notifier: DocsApiNotifier,
    private readonly c4Resolver: DocsApiC4Resolver,
    private readonly logger: Logger,
  ) {}

  /**
   * docs ディレクトリのパスを設定する。設定後、自動で scan() が走る。
   * undefined を渡すと docLinks をクリアする。
   */
  setDocsPath(docsPath: string | undefined): void {
    this.docsPath = docsPath;
    if (docsPath) {
      this.scan().catch((err) => {
        this.logger.warn(`[DocsApiHandler.scan] failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    } else {
      this.docLinks = [];
    }
  }

  /** 現在の docLinks (WS 接続時の初回 sync 用に参照される) */
  getCurrent(): readonly DocLink[] {
    return this.docLinks;
  }

  async scan(): Promise<void> {
    if (!this.docsPath) return;
    this.docLinks = await scanLocalDocs(this.docsPath);
    this.notifier.broadcastDocLinks(this.docLinks);
  }

  // -------------------------------------------------------------------------
  //  GET /api/c4/doc-links
  // -------------------------------------------------------------------------

  handleListDocLinks(res: http.ServerResponse): void {
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ docLinks: this.docLinks }));
  }

  // -------------------------------------------------------------------------
  //  GET /api/docs-index?repo=...
  // -------------------------------------------------------------------------

  async handleDocsIndex(res: http.ServerResponse, repo?: string): Promise<void> {
    try {
      // repo 指定なしは workspace global（全件返却）。後方互換。
      if (!repo) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ docs: this.docLinks }));
        return;
      }
      // C4 モデルから repo の要素 ID 集合を構築し、
      // doc.c4Scope のいずれかが要素 ID と完全一致または親パス（pkg_a/x の親 pkg_a）として
      // ヒットするドキュメントだけを返す。
      const store = this.c4Resolver.getC4Store();
      const featureMatrix = this.c4Resolver.getFeatureMatrix();
      const payload = await fetchC4Model(store, 'current', repo, featureMatrix);
      const elementIds = new Set((payload?.model.elements ?? []).map((e) => e.id));
      if (elementIds.size === 0) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ docs: [] }));
        return;
      }
      const elementIdArray = [...elementIds];
      const filtered = this.docLinks.filter((d) =>
        d.c4Scope.some((scope) =>
          elementIds.has(scope) || elementIdArray.some((id) => id.startsWith(scope + '/'))
        )
      );
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ docs: filtered }));
    } catch (e) {
      this.logger.error('[/api/docs-index] failed', e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ docs: this.docLinks }));
    }
  }
}

// ---------------------------------------------------------------------------
//  Helper: scan local docs directory for DocLink entries
// ---------------------------------------------------------------------------

async function scanLocalDocs(docsDir: string): Promise<DocLink[]> {
  const docs: DocLink[] = [];

  let entries: string[];
  try {
    entries = await collectMarkdownFiles(docsDir, '');
  } catch {
    return docs;
  }

  for (const relPath of entries) {
    try {
      const content = await fs.promises.readFile(path.join(docsDir, relPath), 'utf-8');
      const meta = parseLocalFrontmatter(content);
      if (meta) {
        docs.push({ ...meta, path: relPath });
      }
    } catch {
      // skip unreadable files
    }
  }
  return docs;
}

async function collectMarkdownFiles(base: string, rel: string): Promise<string[]> {
  const results: string[] = [];
  const dir = rel ? path.join(base, rel) : base;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...await collectMarkdownFiles(base, entryRel));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(entryRel);
    }
  }
  return results;
}

function parseLocalFrontmatter(raw: string): Omit<DocLink, 'path'> | null {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!fmMatch) return null;
  const fm = fmMatch[1];

  const scopeLines: string[] = [];
  let inScope = false;
  for (const line of fm.split(/\r?\n/)) {
    if (/^c4Scope\s*:/.test(line)) {
      inScope = true;
      const inline = /\[([^\]]*)\]/.exec(line);
      if (inline) {
        scopeLines.push(
          ...inline[1].split(',').map(s => s.trim().replaceAll(/^["']|["']$/g, '')).filter(Boolean),
        );
        inScope = false;
      }
      continue;
    }
    if (inScope) {
      if (/^\s+-\s+/.test(line)) {
        scopeLines.push(line.replace(/^\s+-\s+/, '').trim().replaceAll(/^["']|["']$/g, ''));
      } else {
        inScope = false;
      }
    }
  }
  if (scopeLines.length === 0) return null;

  const titleMatch = /^title\s*:\s*"?(.+?)"?\s*$/m.exec(fm);
  const typeMatch = /^type\s*:\s*"?(\w+)"?\s*$/m.exec(fm);
  const dateMatch = /^date\s*:\s*"?(\d{4}-\d{2}-\d{2})"?\s*$/m.exec(fm);

  return {
    title: titleMatch?.[1] ?? 'Untitled',
    type: typeMatch?.[1] ?? 'unknown',
    c4Scope: scopeLines,
    date: dateMatch?.[1] ?? '',
  };
}
