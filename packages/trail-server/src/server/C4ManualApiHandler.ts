import * as http from 'node:http';

import type { TrailDatabase } from '@anytime-markdown/trail-db';

import type { Logger } from '../runtime/Logger';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export interface C4ManualApiNotifier {
  notifyModelUpdated(): void;
  /** community upsert 後に code graph cache を invalidate するためのフック (任意) */
  notifyCodeGraphUpdated?(): void;
  /** community upsert 後に codeGraphService.loadFromDb() を呼ぶ (任意) */
  refreshCodeGraphCache?(): Promise<void>;
}

export interface CommunitySummaryInput {
  communityId: number;
  name: string;
  summary: string;
}

export interface CommunityMappingInput {
  communityId: number;
  mappings: ReadonlyArray<{ elementId: string; elementType: string; role: 'primary' | 'secondary' | 'dependency' }>;
}

interface ManualElementInput {
  type: string;
  name: string;
  external: boolean;
  parentId: string | null;
  description?: string;
  serviceType?: string;
}

/**
 * `/api/c4/manual-elements` `/api/c4/manual-relationships` `/api/c4/manual-groups` の
 * CRUD ハンドラ群。trailDb への直接アクセスのみで完結する (C4Provider 不要)。
 *
 * 変更後は notifier.notifyModelUpdated() を呼び、WebSocket 経由でクライアントに
 * 'model-updated' を broadcast する。
 */
export class C4ManualApiHandler {
  constructor(
    private readonly trailDb: TrailDatabase,
    private readonly notifier: C4ManualApiNotifier,
    private readonly logger: Logger,
  ) {}

  // -------------------------------------------------------------------------
  //  Manual elements
  // -------------------------------------------------------------------------

  async createElement(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const body = await this.readJsonBody(req);
    if (!this.isValidElementInput(body)) { res.writeHead(400); res.end('invalid body'); return; }
    const id = this.trailDb.saveManualElement(repoName, body);
    const element = this.trailDb.getManualElements(repoName).find(e => e.id === id);
    res.writeHead(201, JSON_HEADERS);
    res.end(JSON.stringify({ element }));
    this.notifier.notifyModelUpdated();
  }

  async updateElement(req: http.IncomingMessage, res: http.ServerResponse, url: URL, id: string): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const existing = this.trailDb.getManualElements(repoName).find(e => e.id === id);
    if (!existing) { res.writeHead(404); res.end('not found'); return; }
    const body = await this.readJsonBody(req);
    this.trailDb.updateManualElement(repoName, id, body as { name?: string; description?: string; external?: boolean });
    const updated = this.trailDb.getManualElements(repoName).find(e => e.id === id);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ element: updated }));
    this.notifier.notifyModelUpdated();
  }

  deleteElement(res: http.ServerResponse, url: URL, id: string): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    this.trailDb.deleteManualElement(repoName, id);
    res.writeHead(204); res.end();
    this.notifier.notifyModelUpdated();
  }

  // -------------------------------------------------------------------------
  //  Manual relationships
  // -------------------------------------------------------------------------

  async createRelationship(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const body = await this.readJsonBody(req) as Record<string, unknown>;
    if (!body?.fromId || !body?.toId) { res.writeHead(400); res.end('invalid body'); return; }
    const id = this.trailDb.saveManualRelationship(repoName, {
      fromId: String(body.fromId),
      toId: String(body.toId),
      label: body.label ? String(body.label) : undefined,
      technology: body.technology ? String(body.technology) : undefined,
    });
    const rel = this.trailDb.getManualRelationships(repoName).find(r => r.id === id);
    res.writeHead(201, JSON_HEADERS);
    res.end(JSON.stringify({ relationship: rel }));
    this.notifier.notifyModelUpdated();
  }

  listRelationships(res: http.ServerResponse, url: URL): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const relationships = this.trailDb.getManualRelationships(repoName);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(relationships));
  }

  deleteRelationship(res: http.ServerResponse, url: URL, id: string): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    this.trailDb.deleteManualRelationship(repoName, id);
    res.writeHead(204); res.end();
    this.notifier.notifyModelUpdated();
  }

  // -------------------------------------------------------------------------
  //  Manual groups
  // -------------------------------------------------------------------------

  listGroups(res: http.ServerResponse, url: URL): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const groups = this.trailDb.getManualGroups(repoName);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(groups));
  }

  async createGroup(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const body = await this.readJsonBody(req) as Record<string, unknown>;
    if (!Array.isArray(body?.memberIds) || body.memberIds.length < 2) {
      res.writeHead(400); res.end('memberIds must have at least 2 elements'); return;
    }
    const id = this.trailDb.saveManualGroup(repoName, {
      memberIds: body.memberIds.map(String),
      label: body.label ? String(body.label) : undefined,
    });
    const group = this.trailDb.getManualGroups(repoName).find(g => g.id === id);
    res.writeHead(201, JSON_HEADERS);
    res.end(JSON.stringify({ group }));
    this.notifier.notifyModelUpdated();
  }

  async updateGroup(req: http.IncomingMessage, res: http.ServerResponse, url: URL, id: string): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const body = await this.readJsonBody(req) as Record<string, unknown>;
    this.trailDb.updateManualGroup(repoName, id, {
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : undefined,
      label: 'label' in body ? (body.label == null ? null : String(body.label)) : undefined,
    });
    res.writeHead(204); res.end();
    this.notifier.notifyModelUpdated();
  }

  deleteGroup(res: http.ServerResponse, url: URL, id: string): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    this.trailDb.deleteManualGroup(repoName, id);
    res.writeHead(204); res.end();
    this.notifier.notifyModelUpdated();
  }

  // -------------------------------------------------------------------------
  //  Communities (GET / upsert summaries / upsert mappings)
  // -------------------------------------------------------------------------

  listCommunities(res: http.ServerResponse, url: URL): void {
    const repoName = url.searchParams.get('repoName') ?? url.searchParams.get('repo');
    if (!repoName) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'repoName required' }));
      return;
    }
    try {
      const communities = this.trailDb.listCurrentCodeGraphCommunities(repoName);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ communities }));
    } catch (err) {
      this.logger.error('listCommunities failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async upsertCommunitySummaries(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    try {
      const body = (await this.readJsonBody(req)) as {
        repoName?: string;
        summaries?: ReadonlyArray<CommunitySummaryInput>;
      };
      const repoName = body.repoName ?? url.searchParams.get('repoName') ?? url.searchParams.get('repo');
      if (!repoName) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'repoName required (in body or query)' }));
        return;
      }
      if (!Array.isArray(body.summaries)) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'summaries array required' }));
        return;
      }
      const result = this.trailDb.upsertCurrentCodeGraphCommunitySummaries(repoName, body.summaries);
      // codeGraphService の in-memory cache を DB と同期してから client に通知。
      // これにより /api/code-graph が新しい communitySummaries を返し、
      // useCodeGraph 側で WS 経由 refetch が走る → Reload Window 不要。
      await this.notifier.refreshCodeGraphCache?.();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
      this.notifier.notifyModelUpdated();
      this.notifier.notifyCodeGraphUpdated?.();
    } catch (err) {
      this.logger.error('upsertCommunitySummaries failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async upsertCommunityMappings(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    try {
      const body = (await this.readJsonBody(req)) as {
        repoName?: string;
        mappings?: ReadonlyArray<CommunityMappingInput>;
      };
      const repoName = body.repoName ?? url.searchParams.get('repoName') ?? url.searchParams.get('repo');
      if (!repoName) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'repoName required (in body or query)' }));
        return;
      }
      if (!Array.isArray(body.mappings)) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'mappings array required' }));
        return;
      }
      const result = this.trailDb.upsertCurrentCodeGraphCommunityMappings(repoName, body.mappings);
      await this.notifier.refreshCodeGraphCache?.();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
      this.notifier.notifyModelUpdated();
      this.notifier.notifyCodeGraphUpdated?.();
    } catch (err) {
      this.logger.error('upsertCommunityMappings failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private isValidElementInput(body: unknown): body is ManualElementInput {
    if (typeof body !== 'object' || body === null) return false;
    const b = body as Record<string, unknown>;
    if (!['person', 'system', 'container', 'component'].includes(String(b.type))) return false;
    if (typeof b.name !== 'string' || b.name.length === 0) return false;
    if (b.serviceType !== undefined && typeof b.serviceType !== 'string') return false;
    return true;
  }

  private readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c as Buffer));
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        } catch (e) {
          this.logger.warn(`[C4ManualApiHandler.readJsonBody] invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }
}
