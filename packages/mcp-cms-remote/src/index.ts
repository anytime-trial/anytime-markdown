import { DOMParser } from '@xmldom/xmldom';
// @aws-sdk/client-s3 が XML レスポンスのパースに DOMParser と Node を使用するが、
// Cloudflare Workers 環境には存在しないためポリフィルが必要
const g = globalThis as unknown as Record<string, unknown>;
g.DOMParser = DOMParser;
if (!g.Node) {
  g.Node = {
    ELEMENT_NODE: 1, ATTRIBUTE_NODE: 2, TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4, PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8, DOCUMENT_NODE: 9, DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11,
  };
}

import { Hono } from 'hono';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toReqRes, toFetchResponse } from 'fetch-to-node';

import { createCmsConfig, createS3Client } from '@anytime-markdown/cms-core';
import { isTicketProviderKind } from '@anytime-markdown/tickets-core';
import { createRemoteMcpServer, type TicketsConfig } from './server.js';
import { paperConfig } from './paperConfig.js';
import { fetchWebPageForImport, resolveAllowedOrigin, WebFetchProxyError } from './webFetchProxy.js';

interface Env {
  MCP_API_KEY: string;
  ANYTIME_AWS_ACCESS_KEY_ID: string;
  ANYTIME_AWS_SECRET_ACCESS_KEY: string;
  ANYTIME_AWS_REGION?: string;
  S3_DOCS_BUCKET: string;
  S3_DOCS_PREFIX?: string;
  S3_REPORTS_PREFIX?: string;
  // Paper ranking
  PAPER_S3_BUCKET?: string;
  OPENALEX_MAILTO: string;
  WEB_IMPORT_ALLOW_ORIGIN?: string;
  // Ticket registration (create_ticket は token + repo が揃った場合のみ登録。TICKETS_BRANCH 省略時 main)
  TICKETS_GITHUB_TOKEN?: string;
  TICKETS_REPO?: string;
  TICKETS_BRANCH?: string;
  // チケットプロバイダ切替（NFR-7）。'github-contents'（既定）| 'github-issues'
  TICKETS_PROVIDER?: string;
}

/** 環境変数からチケットプロバイダ設定を組み立てる。不正な TICKETS_PROVIDER は登録せずエラーログを残す */
function resolveTicketsConfig(env: Env): TicketsConfig | undefined {
  if (!env.TICKETS_GITHUB_TOKEN || !env.TICKETS_REPO) {
    return undefined;
  }
  // 空文字 secret（CI の変数未設定など）も既定へ倒すため ?? でなく || を使う
  const kind = env.TICKETS_PROVIDER || 'github-contents';
  if (!isTicketProviderKind(kind)) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] TICKETS_PROVIDER が不正なため create_ticket を無効化します: ${kind}`,
    );
    return undefined;
  }
  if (kind === 'github-issues') {
    return { provider: kind, token: env.TICKETS_GITHUB_TOKEN, repo: env.TICKETS_REPO };
  }
  return {
    provider: 'github-contents',
    token: env.TICKETS_GITHUB_TOKEN,
    repo: env.TICKETS_REPO,
    branch: env.TICKETS_BRANCH || 'main',
  };
}

const app = new Hono<{ Bindings: Env }>();

function webImportCorsHeaders(allowOrigin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

// API キー検証ミドルウェア
app.use('/mcp', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const expectedKey = c.env.MCP_API_KEY;

  if (!expectedKey) {
    return c.json({ error: 'Server misconfigured' }, 500);
  }

  const queryToken = c.req.query('token');
  const isAuthorized =
    (authHeader && authHeader === `Bearer ${expectedKey}`) ||
    (queryToken && queryToken === expectedKey);

  if (!isAuthorized) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

// MCP Streamable HTTP エンドポイント
app.post('/mcp', async (c) => {
  const config = createCmsConfig(c.env as unknown as Record<string, string | undefined>);
  const s3Client = createS3Client(config);
  const rankingsConfig = {
    bucket: c.env.PAPER_S3_BUCKET ?? c.env.S3_DOCS_BUCKET,
    patentsPrefix: paperConfig.rankingS3Prefix,
    mailto: c.env.OPENALEX_MAILTO,
  };
  const ticketsConfig = resolveTicketsConfig(c.env);
  const server = createRemoteMcpServer(s3Client, config, rankingsConfig, ticketsConfig);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  server.server.onerror = (error) => console.error('[MCP Server Error]', error);
  transport.onerror = (error) => console.error('[MCP Transport Error]', error);

  const { req, res } = toReqRes(c.req.raw);
  const body = await c.req.json();

  await server.server.connect(transport);
  await transport.handleRequest(req, res, body);

  return toFetchResponse(res);
});

// GET/DELETE は 405
app.get('/mcp', (c) => c.json({ error: 'Method not allowed. Use POST.' }, 405));
app.delete('/mcp', (c) => c.json({ error: 'Method not allowed. Use POST.' }, 405));

// ヘルスチェック
app.get('/health', (c) => c.json({ status: 'ok' }));

app.options('/fetch', (c) => {
  const allowOrigin = resolveAllowedOrigin(c.env.WEB_IMPORT_ALLOW_ORIGIN, c.req.header('origin'));
  if (allowOrigin === null) return c.body(null, 403);
  return c.body(null, 204, webImportCorsHeaders(allowOrigin));
});

app.get('/fetch', async (c) => {
  const allowOrigin = resolveAllowedOrigin(c.env.WEB_IMPORT_ALLOW_ORIGIN, c.req.header('origin'));
  if (allowOrigin === null) {
    return c.json({ error: 'origin_not_allowed' }, 403);
  }
  const corsHeaders = webImportCorsHeaders(allowOrigin);
  const url = c.req.query('url');
  if (!url) {
    return c.json({ error: 'missing_url' }, 400, corsHeaders);
  }

  try {
    const result = await fetchWebPageForImport(url);
    return c.json(result, 200, corsHeaders);
  } catch (error) {
    if (error instanceof WebFetchProxyError) {
      return c.json({ error: error.code }, error.status as 400, corsHeaders);
    }
    console.error('[Web Import Fetch Error]', error);
    return c.json({ error: 'internal_error' }, 500, corsHeaders);
  }
});

export default app;
