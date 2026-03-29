import { DOMParser } from '@xmldom/xmldom';
// @aws-sdk/client-s3 が XML レスポンスのパースに DOMParser を使用するが、
// Cloudflare Workers 環境には存在しないためポリフィルが必要
(globalThis as unknown as Record<string, unknown>).DOMParser = DOMParser;

import { Hono } from 'hono';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toReqRes, toFetchResponse } from 'fetch-to-node';

import { createCmsConfig, createS3Client } from '@anytime-markdown/cms-core';
import { createRemoteMcpServer } from './server.js';

interface Env {
  MCP_API_KEY: string;
  ANYTIME_AWS_ACCESS_KEY_ID: string;
  ANYTIME_AWS_SECRET_ACCESS_KEY: string;
  ANYTIME_AWS_REGION?: string;
  S3_DOCS_BUCKET: string;
  S3_DOCS_PREFIX?: string;
  S3_REPORTS_PREFIX?: string;
}

const app = new Hono<{ Bindings: Env }>();

// API キー検証ミドルウェア
app.use('/mcp', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const expectedKey = c.env.MCP_API_KEY;

  if (!expectedKey) {
    return c.json({ error: 'Server misconfigured' }, 500);
  }

  if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

// MCP Streamable HTTP エンドポイント
app.post('/mcp', async (c) => {
  const config = createCmsConfig(c.env as unknown as Record<string, string | undefined>);
  const s3Client = createS3Client(config);
  const server = createRemoteMcpServer(s3Client, config);

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

export default app;
