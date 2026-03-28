import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';

import {
  createCmsConfig,
  createS3Client,
  deleteDoc,
  listDocs,
  listReportKeys,
  uploadDoc,
  uploadReport,
} from '@anytime-markdown/cms-core';

export function createMcpServer(): McpServer {
  const config = createCmsConfig();
  const client = createS3Client(config);

  const server = new McpServer({
    name: 'anytime-markdown-cms',
    version: '0.0.1',
  });

  server.tool(
    'upload_report',
    'Upload a local Markdown file to S3 reports prefix',
    { filePath: z.string().describe('Absolute path to the local .md file') },
    async ({ filePath }) => {
      const fileName = basename(filePath);
      const content = await readFile(filePath, 'utf-8');
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
    'Upload a local file to S3 docs prefix',
    {
      filePath: z.string().describe('Absolute path to the local file (.md or image)'),
      folder: z.string().optional().describe('Optional subfolder name'),
    },
    async ({ filePath, folder }) => {
      const fileName = basename(filePath);
      const isText = fileName.endsWith('.md');
      const content = isText
        ? await readFile(filePath, 'utf-8')
        : await readFile(filePath);
      const result = await uploadDoc({ fileName, content, folder }, client, config);
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

  return server;
}
