import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

import {
  type CmsConfig,
  deleteDoc,
  getPatentFile,
  listDocs,
  listPatentFiles,
  listReportKeys,
  uploadDoc,
  uploadReport,
} from '@anytime-markdown/cms-core';

interface PapersConfig {
  bucket: string;
  patentsPrefix: string;
}

type ToolArgs = Record<string, unknown>;
type ToolResult = { content: Array<{ type: 'text'; text: string }> };
type ToolCallback = (args: ToolArgs) => Promise<ToolResult>;

/**
 * server.tool() のラッパー。MCP SDK の Zod スキーマ型推論が TS2589 を引き起こすため、
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
  server.tool(name, description, params, handler);
}

const uploadReportParams: Record<string, z.ZodType> = {
  fileName: z.string().describe('File name (e.g. "2026-03-28-daily-research.md")'),
  content: z.string().describe('Markdown file content as UTF-8 string'),
};

const uploadDocParams: Record<string, z.ZodType> = {
  fileName: z.string().describe('File name (e.g. "guide.md" or "diagram.png")'),
  content: z.string().describe('File content: UTF-8 string for .md, base64-encoded string for images'),
  folder: z.string().optional().describe('Optional subfolder name'),
  isBase64: z.boolean().optional().describe('Set true if content is base64-encoded (for images)'),
};

const deleteDocParams: Record<string, z.ZodType> = {
  key: z.string().describe('S3 key of the document to delete (e.g. "docs/file.md")'),
};

const paperRankingParams: Record<string, z.ZodType> = {
  fileName: z.string().describe('File name (e.g. "monthly-2026-04-01.tsv")'),
};

export function createRemoteMcpServer(
  client: S3Client,
  config: CmsConfig,
  rankingsConfig?: PapersConfig,
): McpServer {
  const server = new McpServer({
    name: 'anytime-markdown-cms-remote',
    version: '0.0.1',
  });

  registerTool(server, 'upload_report', 'Upload a Markdown report to S3 reports prefix',
    uploadReportParams, async (args) => {
      const fileName = args.fileName as string;
      const content = args.content as string;
      const result = await uploadReport({ fileName, content }, client, config);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    });

  registerTool(server, 'list_reports', 'List all report files in S3 reports prefix',
    {}, async () => {
      const reports = await listReportKeys(client, config);
      return { content: [{ type: 'text', text: JSON.stringify(reports, null, 2) }] };
    });

  registerTool(server, 'upload_doc', 'Upload a document or image to S3 docs prefix',
    uploadDocParams, async (args) => {
      const fileName = args.fileName as string;
      const content = args.content as string;
      const folder = args.folder as string | undefined;
      const isBase64 = args.isBase64 as boolean | undefined;
      const body = isBase64 ? Buffer.from(content, 'base64') : content;
      const result = await uploadDoc({ fileName, content: body, folder }, client, config);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    });

  registerTool(server, 'list_docs', 'List all document files in S3 docs prefix',
    {}, async () => {
      const docs = await listDocs(client, config);
      return { content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }] };
    });

  registerTool(server, 'delete_doc', 'Delete a document from S3 docs prefix',
    deleteDocParams, async (args) => {
      const key = args.key as string;
      await deleteDoc({ key }, client, config);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: true, key }) }] };
    });

  if (rankingsConfig) {
    registerTool(server, 'list_paper_rankings', 'List saved paper citation ranking files',
      {}, async () => {
        const entries = await listPatentFiles(client, rankingsConfig);
        return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] };
      });

    registerTool(server, 'get_paper_ranking', 'Get paper citation ranking TSV',
      paperRankingParams, async (args) => {
        const fileName = args.fileName as string;
        const key = `${rankingsConfig.patentsPrefix}${fileName}`;
        const content = await getPatentFile(key, client, rankingsConfig);
        return { content: [{ type: 'text', text: content }] };
      });
  }

  return server;
}
