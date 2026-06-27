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
import { createRemoteMcpServer } from './server.js';
import { paperConfig } from './paperConfig.js';
import { fetchWebPageForImport, WebFetchProxyError } from './webFetchProxy.js';

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
}

const app = new Hono<{ Bindings: Env }>();

function webImportCorsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.WEB_IMPORT_ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
  const server = createRemoteMcpServer(s3Client, config, rankingsConfig);

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

app.options('/fetch', (c) => c.body(null, 204, webImportCorsHeaders(c.env)));

app.get('/fetch', async (c) => {
  const corsHeaders = webImportCorsHeaders(c.env);
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
