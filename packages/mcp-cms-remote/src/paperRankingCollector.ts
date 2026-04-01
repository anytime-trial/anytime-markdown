import {
  uploadPatentFile,
  createCmsConfig,
  createS3Client,
} from '@anytime-markdown/cms-core';
import { paperConfig } from './paperConfig.js';
import type { PaperCollectorEnv } from './paperCollector.js';

/** OpenAlex API のレスポンス中の著者情報 */
interface OpenAlexAuthorship {
  readonly author: { readonly display_name: string };
}

/** OpenAlex API のレスポンス中のトピック情報 */
interface OpenAlexTopic {
  readonly subfield: { readonly display_name: string };
}

/** OpenAlex API のレスポンス中のロケーション情報 */
interface OpenAlexLocation {
  readonly landing_page_url: string;
}

/** OpenAlex API の works エンドポイントのレスポンス要素 */
interface OpenAlexWork {
  readonly title: string;
  readonly cited_by_count: number;
  readonly publication_date: string;
  readonly authorships: readonly OpenAlexAuthorship[];
  readonly primary_topic: OpenAlexTopic | null;
  readonly primary_location: OpenAlexLocation | null;
}

/** ランキング用の正規化済み論文データ */
export interface RankedPaper {
  readonly arxiv_id: string;
  readonly title: string;
  readonly cited_by_count: number;
  readonly publication_date: string;
  readonly authors: readonly string[];
  readonly subfield: string;
  readonly pdf_url: string;
}

const MAX_AUTHORS = 5;
const ARXIV_ABS_PREFIX = 'https://arxiv.org/abs/';
const ARXIV_PDF_PREFIX = 'https://arxiv.org/pdf/';

/**
 * 指定月数前の日付を計算する。
 */
function computeFromDate(today: string, months: number): string {
  const date = new Date(today);
  date.setMonth(date.getMonth() - months);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * OpenAlex API の URL を構築する。
 * フィルタ: from_publication_date, to_publication_date, locations.source.id
 * ソート: cited_by_count:desc
 */
export function buildOpenAlexUrl(
  months: number,
  fetchCount: number,
  today: string,
): string {
  const fromDate = computeFromDate(today, months);
  const { openAlexBaseUrl, openAlexArxivSourceId } = paperConfig;
  const filter = [
    `from_publication_date:${fromDate}`,
    `to_publication_date:${today}`,
    `locations.source.id:${openAlexArxivSourceId}`,
  ].join(',');

  return `${openAlexBaseUrl}/works?filter=${filter}&sort=cited_by_count:desc&per_page=${fetchCount}&mailto=noreply@example.com`;
}

/**
 * OpenAlex JSON レスポンスから論文データを抽出する。
 */
export function parseOpenAlexResponse(
  results: readonly OpenAlexWork[],
): RankedPaper[] {
  return results.map((work) => {
    const landingUrl = work.primary_location?.landing_page_url ?? '';
    const arxivId = landingUrl.startsWith(ARXIV_ABS_PREFIX)
      ? landingUrl.slice(ARXIV_ABS_PREFIX.length)
      : landingUrl;

    const authors = work.authorships
      .slice(0, MAX_AUTHORS)
      .map((a) => a.author.display_name);

    const subfield = work.primary_topic?.subfield?.display_name ?? '';

    const pdfUrl = arxivId
      ? `${ARXIV_PDF_PREFIX}${arxivId}`
      : '';

    return {
      arxiv_id: arxivId,
      title: work.title,
      cited_by_count: work.cited_by_count,
      publication_date: work.publication_date,
      authors,
      subfield,
      pdf_url: pdfUrl,
    };
  });
}

/**
 * RankedPaper[] を JSONL 形式に変換する。
 */
export function formatRankingToJsonl(papers: readonly RankedPaper[]): string {
  if (papers.length === 0) {
    return '';
  }

  return papers
    .map((p) => JSON.stringify({
      arxiv_id: p.arxiv_id,
      title: p.title,
      cited_by_count: p.cited_by_count,
      publication_date: p.publication_date,
      authors: [...p.authors],
      subfield: p.subfield,
      pdf_url: p.pdf_url,
    }))
    .join('\n');
}

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * OpenAlex API で arXiv 論文の引用数ランキングを取得し、JSONL で S3 に保存する。
 */
export async function collectPaperRanking(
  env: PaperCollectorEnv,
  type: 'weekly' | 'monthly',
): Promise<void> {
  const cronEnabled = env.PAPER_CRON_ENABLED !== undefined
    ? env.PAPER_CRON_ENABLED !== 'false'
    : paperConfig.cronEnabled;

  if (!cronEnabled) {
    console.log('Paper ranking collection is disabled');
    return;
  }

  const months = type === 'weekly'
    ? paperConfig.weeklyRankingMonths
    : paperConfig.monthlyRankingMonths;

  const today = getTodayString();
  const url = buildOpenAlexUrl(months, paperConfig.rankingFetchCount, today);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`OpenAlex API request failed: ${message}`);
    return;
  }

  if (!response.ok) {
    console.error(`OpenAlex API error: ${response.status} ${response.statusText}`);
    return;
  }

  const data = await response.json() as { results: OpenAlexWork[] };
  const papers = parseOpenAlexResponse(data.results);

  if (papers.length === 0) {
    console.log('No ranked papers found');
    return;
  }

  console.log(`Fetched ${papers.length} ranked papers from OpenAlex`);

  const jsonl = formatRankingToJsonl(papers);
  const fileName = `${type}-${today}.jsonl`;

  const cmsConfig = createCmsConfig({
    S3_DOCS_BUCKET: env.PAPER_S3_BUCKET ?? env.S3_DOCS_BUCKET,
    ANYTIME_AWS_ACCESS_KEY_ID: env.ANYTIME_AWS_ACCESS_KEY_ID,
    ANYTIME_AWS_SECRET_ACCESS_KEY: env.ANYTIME_AWS_SECRET_ACCESS_KEY,
    ANYTIME_AWS_REGION: env.ANYTIME_AWS_REGION,
  });
  const s3Client = createS3Client(cmsConfig);
  const rankingsConfig = {
    bucket: cmsConfig.bucket,
    patentsPrefix: paperConfig.rankingS3Prefix,
  };

  await uploadPatentFile({ fileName, content: jsonl }, s3Client, rankingsConfig);

  console.log(`Uploaded ${type} ranking file: ${fileName}`);
}
