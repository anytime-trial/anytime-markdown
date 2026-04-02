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
  uploadPatentFile,
  uploadReport,
} from '@anytime-markdown/cms-core';

import {
  fetchRankingFromOpenAlex,
  formatRankingToTsv,
  parseWrittenList,
  addToWrittenList,
} from './paperRankingCollector.js';
import { paperConfig } from './paperConfig.js';

interface PapersConfig {
  bucket: string;
  patentsPrefix: string;
  mailto: string;
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

const getUnwrittenPapersParams: Record<string, z.ZodType> = {
  count: z.number().describe('Number of unwritten papers to return'),
};

const markPaperWrittenParams: Record<string, z.ZodType> = {
  arxivId: z.string().describe('arXiv ID of the paper to mark as written'),
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
    registerTool(server, 'get_unwritten_papers',
      'Get top-ranked unwritten papers. Fetches from OpenAlex if not cached.',
      getUnwrittenPapersParams, async (args) => {
        const count = args.count as number;
        const today = new Date().toISOString().slice(0, 10);
        const monthKey = today.slice(0, 7); // YYYY-MM
        const rankingFileName = `monthly-${monthKey}.tsv`;
        const rankingKey = `${rankingsConfig.patentsPrefix}${rankingFileName}`;
        const writtenKey = `${rankingsConfig.patentsPrefix}${paperConfig.writtenFileName}`;

        // 1. ランキングTSVを取得（キャッシュ or 新規取得）
        let rankingTsv: string;
        try {
          rankingTsv = await getPatentFile(rankingKey, client, rankingsConfig);
        } catch {
          // S3にない → OpenAlexから取得して保存
          const papers = await fetchRankingFromOpenAlex(
            paperConfig.monthlyRankingMonths,
            paperConfig.rankingFetchCount,
            today,
            rankingsConfig.mailto,
          );
          rankingTsv = formatRankingToTsv(papers);
          await uploadPatentFile(
            { fileName: rankingFileName, content: rankingTsv },
            client, rankingsConfig,
          );
        }

        // 2. 作成済みリストを取得
        let writtenIds: Set<string>;
        try {
          const writtenTsv = await getPatentFile(writtenKey, client, rankingsConfig);
          writtenIds = parseWrittenList(writtenTsv);
        } catch {
          writtenIds = new Set();
        }

        // 3. 未作成の上位N件をフィルタ
        const lines = rankingTsv.split('\n');
        const header = lines[0];
        const dataLines = lines.slice(1).filter((line) => {
          const arxivId = line.split('\t')[2]; // rank, cited_by_count, arxiv_id, ...
          return arxivId && !writtenIds.has(arxivId);
        });

        const result = [header, ...dataLines.slice(0, count)].join('\n');
        return { content: [{ type: 'text', text: result }] };
      });

    registerTool(server, 'mark_paper_written',
      'Mark a paper as written (add to written list in S3)',
      markPaperWrittenParams, async (args) => {
        const arxivId = args.arxivId as string;
        const today = new Date().toISOString().slice(0, 10);
        const writtenKey = `${rankingsConfig.patentsPrefix}${paperConfig.writtenFileName}`;

        let existingTsv = '';
        try {
          existingTsv = await getPatentFile(writtenKey, client, rankingsConfig);
        } catch {
          // ファイルなし
        }

        const updatedTsv = addToWrittenList(existingTsv, arxivId, today);
        await uploadPatentFile(
          { fileName: paperConfig.writtenFileName, content: updatedTsv },
          client, rankingsConfig,
        );

        return { content: [{ type: 'text', text: JSON.stringify({ marked: true, arxivId, date: today }) }] };
      });

    registerTool(server, 'list_paper_rankings', 'List saved paper citation ranking files',
      {}, async () => {
        const entries = await listPatentFiles(client, rankingsConfig);
        return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] };
      });
  }

  return server;
}
