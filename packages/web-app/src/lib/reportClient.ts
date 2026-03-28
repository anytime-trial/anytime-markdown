import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

import { createCmsConfig } from '@anytime-markdown/cms-core';
import type { ReportMeta } from '../types/report';
import { reportFrontmatterSchema } from '../types/report';
import { parseFrontmatter, sortByDateDesc } from './reportUtils';
import { DOCS_BUCKET, s3Client } from './s3Client';

const cmsConfig = createCmsConfig();
export const REPORTS_PREFIX = cmsConfig.reportsPrefix;

/** S3 からレポート一覧を取得し、frontmatter を解析して日付降順で返す */
export async function listReports(): Promise<ReportMeta[]> {
  if (!DOCS_BUCKET) return [];

  const command = new ListObjectsV2Command({
    Bucket: DOCS_BUCKET,
    Prefix: REPORTS_PREFIX,
  });
  const response = await s3Client.send(command);
  const objects = response.Contents ?? [];

  // .md ファイルのみ対象（_index.json や画像ファイルを除外）
  const mdKeys = objects
    .map((obj) => obj.Key)
    .filter((key): key is string => !!key && key.endsWith('.md'));

  // 並列で各ファイルの frontmatter を取得
  const results = await Promise.allSettled(
    mdKeys.map(async (key) => {
      const obj = await s3Client.send(
        new GetObjectCommand({ Bucket: DOCS_BUCKET, Key: key }),
      );
      const body = await obj.Body?.transformToString('utf-8');
      if (!body) return null;

      const { data } = parseFrontmatter(body);
      const parsed = reportFrontmatterSchema.safeParse(data);
      if (!parsed.success) return null;

      const slug = key.slice(REPORTS_PREFIX.length).replace(/\.md$/, '');
      return { ...parsed.data, slug, key } satisfies ReportMeta;
    }),
  );

  const reports = results
    .filter((r): r is PromiseFulfilledResult<ReportMeta | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((r): r is ReportMeta => r !== null);

  return sortByDateDesc(reports);
}

/** slug からレポート記事を取得する */
export async function getReportBySlug(slug: string): Promise<{ meta: ReportMeta; content: string } | null> {
  if (!DOCS_BUCKET) return null;

  // パストラバーサル防止
  if (slug.includes('..') || slug.includes('/') || slug.includes('\0')) return null;

  const key = `${REPORTS_PREFIX}${slug}.md`;

  try {
    const obj = await s3Client.send(
      new GetObjectCommand({ Bucket: DOCS_BUCKET, Key: key }),
    );
    const body = await obj.Body?.transformToString('utf-8');
    if (!body) return null;

    const { data, content } = parseFrontmatter(body);
    const parsed = reportFrontmatterSchema.safeParse(data);
    if (!parsed.success) return null;

    return {
      meta: { ...parsed.data, slug, key },
      content,
    };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'NoSuchKey') return null;
    throw e;
  }
}
