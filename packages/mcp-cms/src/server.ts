import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';

import {
  createCmsConfig,
  createS3Client,
  deleteDoc,
  listDocs,
  getReport,
  listReportKeys,
  uploadDoc,
  uploadReport,
} from '@anytime-markdown/cms-core';

type ToolArgs = Record<string, unknown>;
type ToolResult = { content: Array<{ type: 'text'; text: string }> };
type ToolCallback = (args: ToolArgs) => Promise<ToolResult>;

/**
 * server.registerTool() のラッパー。MCP SDK の Zod スキーマ型推論が TS2589 を引き起こすため、
 * パラメータ型を Record<string, z.ZodType> にキャストして型推論の深さを制限する。
 */
function registerTool(
  server: McpServer,
  name: string,
  description: string,
  params: Record<string, z.ZodType>,
  handler: ToolCallback,
): void {
  // @ts-expect-error TS2589: MCP SDK の Zod 型推論が深すぎる既知の制限
  server.registerTool(name, { description, inputSchema: params }, handler);
}

export function createMcpServer(): McpServer {
  const config = createCmsConfig();
  const client = createS3Client(config);

  const server = new McpServer({
    name: 'anytime-markdown-cms',
    version: '0.0.1',
  });

  registerTool(server, 'upload_report',
    'Upload a local Markdown file to S3 reports prefix',
    { filePath: z.string().describe('Absolute path to the local .md file') },
    async (args) => {
      const filePath = args.filePath as string;
      const fileName = basename(filePath);
      const content = await readFile(filePath, 'utf-8');
      const result = await uploadReport({ fileName, content }, client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  registerTool(server, 'list_reports',
    'List all report files in S3 reports prefix',
    {},
    async () => {
      const reports = await listReportKeys(client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify(reports, null, 2) }] };
    },
  );

  registerTool(server, 'get_report',
    'Get the Markdown content of a report from S3 reports prefix',
    { fileName: z.string().describe('File name (e.g. "2026-03-28-daily-research.md")') },
    async (args) => {
      const fileName = args.fileName as string;
      const result = await getReport({ fileName }, client, config);
      return { content: [{ type: 'text' as const, text: result.content }] };
    },
  );

  registerTool(server, 'upload_doc',
    'Upload a local file to S3 docs prefix',
    {
      filePath: z.string().describe('Absolute path to the local file (.md or image)'),
      folder: z.string().optional().describe('Optional subfolder name'),
    },
    async (args) => {
      const filePath = args.filePath as string;
      const folder = args.folder as string | undefined;
      const fileName = basename(filePath);
      const isText = fileName.endsWith('.md');
      const content = isText
        ? await readFile(filePath, 'utf-8')
        : await readFile(filePath);
      const result = await uploadDoc({ fileName, content, folder }, client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  registerTool(server, 'list_docs',
    'List all document files in S3 docs prefix',
    {},
    async () => {
      const docs = await listDocs(client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify(docs, null, 2) }] };
    },
  );

  registerTool(server, 'delete_doc',
    'Delete a document from S3 docs prefix',
    { key: z.string().describe('S3 key of the document to delete (e.g. "docs/file.md")') },
    async (args) => {
      const key = args.key as string;
      await deleteDoc({ key }, client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, key }) }] };
    },
  );

  return server;
}
