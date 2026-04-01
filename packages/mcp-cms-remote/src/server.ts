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

interface PatentsConfig {
  bucket: string;
  patentsPrefix: string;
}

export function createRemoteMcpServer(
  client: S3Client,
  config: CmsConfig,
  patentsConfig?: PatentsConfig,
): McpServer {
  const server = new McpServer({
    name: 'anytime-markdown-cms-remote',
    version: '0.0.1',
  });

  server.tool(
    'upload_report',
    'Upload a Markdown report to S3 reports prefix',
    {
      fileName: z.string().describe('File name (e.g. "2026-03-28-daily-research.md")'),
      content: z.string().describe('Markdown file content as UTF-8 string'),
    },
    async ({ fileName, content }) => {
      const result = await uploadReport({ fileName, content }, client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'list_reports',
    'List all report files in S3 reports prefix',
    {},
    async () => {
      const reports = await listReportKeys(client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify(reports, null, 2) }] };
    },
  );

  server.tool(
    'upload_doc',
    'Upload a document or image to S3 docs prefix',
    {
      fileName: z.string().describe('File name (e.g. "guide.md" or "diagram.png")'),
      content: z.string().describe('File content: UTF-8 string for .md, base64-encoded string for images'),
      folder: z.string().optional().describe('Optional subfolder name'),
      isBase64: z.boolean().optional().describe('Set true if content is base64-encoded (for images)'),
    },
    async ({ fileName, content, folder, isBase64 }) => {
      const body = isBase64 ? Buffer.from(content, 'base64') : content;
      const result = await uploadDoc({ fileName, content: body, folder }, client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    'list_docs',
    'List all document files in S3 docs prefix',
    {},
    async () => {
      const docs = await listDocs(client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify(docs, null, 2) }] };
    },
  );

  server.tool(
    'delete_doc',
    'Delete a document from S3 docs prefix',
    { key: z.string().describe('S3 key of the document to delete (e.g. "docs/file.md")') },
    async ({ key }) => {
      await deleteDoc({ key }, client, config);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, key }) }] };
    },
  );

  if (patentsConfig) {
    server.tool(
      'list_patents',
      'List saved patent data files by date',
      {},
      async () => {
        const entries = await listPatentFiles(client, patentsConfig);
        return { content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }] };
      },
    );

    server.tool(
      'get_patent_index',
      'Get TSV index of patents for a specific date (low token cost)',
      { date: z.string().describe('Date in YYYY-MM-DD format') },
      async ({ date }) => {
        const key = `${patentsConfig.patentsPrefix}${date}.tsv`;
        const content = await getPatentFile(key, client, patentsConfig);
        return { content: [{ type: 'text' as const, text: content }] };
      },
    );

    server.tool(
      'get_patent_detail',
      'Get patent details from JSONL data, optionally filtered by patent ID or keyword',
      {
        date: z.string().describe('Date in YYYY-MM-DD format'),
        patentId: z.string().optional().describe('Filter by patent ID (exact match)'),
        keyword: z.string().optional().describe('Filter by keyword in title/abstract (case-insensitive)'),
      },
      async ({ date, patentId, keyword }) => {
        const key = `${patentsConfig.patentsPrefix}${date}.jsonl`;
        const content = await getPatentFile(key, client, patentsConfig);
        let lines = content.split('\n').filter(Boolean);

        if (patentId) {
          lines = lines.filter((line) => line.includes(`"${patentId}"`));
        }
        if (keyword) {
          const lower = keyword.toLowerCase();
          lines = lines.filter((line) => line.toLowerCase().includes(lower));
        }

        const result: unknown[] = [];
        for (const line of lines) {
          try {
            result.push(JSON.parse(line));
          } catch {
            // skip malformed lines
          }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      },
    );
  }

  return server;
}
