import {
  uploadPatentFile,
  createCmsConfig,
  createS3Client,
} from '@anytime-markdown/cms-core';
import { paperConfig } from './paperConfig.js';

/** arXiv 論文の正規化済みデータ */
interface Paper {
  readonly arxiv_id: string;
  readonly title: string;
  readonly abstract: string;
  readonly published: string;
  readonly authors: readonly string[];
  readonly categories: readonly string[];
  readonly pdf_url: string;
}

export interface PaperCollectorEnv {
  PAPER_S3_BUCKET?: string;
  /** 環境変数で cronEnabled を上書き（'true'/'false'） */
  PAPER_CRON_ENABLED?: string;
  S3_DOCS_BUCKET: string;
  ANYTIME_AWS_ACCESS_KEY_ID: string;
  ANYTIME_AWS_SECRET_ACCESS_KEY: string;
  ANYTIME_AWS_REGION?: string;
}

const TSV_HEADER = 'arxiv_id\tpublished\tcategories\tauthors\ttitle\tabstract\tpdf_url';

function computeSinceDate(today: string, lookbackDays: number): string {
  const date = new Date(today);
  date.setDate(date.getDate() - lookbackDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * arXiv API の検索クエリを構築する。
 * 例: `cat:cs.AI+AND+submittedDate:[202603250000+TO+202604012359]`
 */
export function buildArxivQuery(
  category: string,
  lookbackDays: number,
  today: string,
): string {
  const sinceDate = computeSinceDate(today, lookbackDays);
  const todayCompact = today.replaceAll('-', '');
  return `cat:${category}+AND+submittedDate:[${sinceDate}0000+TO+${todayCompact}2359]`;
}

export function formatToTsv(papers: readonly Paper[]): string {
  if (papers.length === 0) {
    return TSV_HEADER;
  }

  const rows = papers.map((p) => {
    const cats = p.categories.join(',');
    const authors = p.authors.join('; ').replaceAll('\t', ' ');
    const title = p.title.replaceAll('\t', ' ').replaceAll('\n', ' ');
    const abstract = p.abstract.replaceAll('\t', ' ').replaceAll('\n', ' ');
    return `${p.arxiv_id}\t${p.published}\t${cats}\t${authors}\t${title}\t${abstract}\t${p.pdf_url}`;
  });

  return [TSV_HEADER, ...rows].join('\n');
}

export function formatToJsonl(papers: readonly Paper[]): string {
  if (papers.length === 0) {
    return '';
  }

  return papers
    .map((p) => JSON.stringify({
      arxiv_id: p.arxiv_id,
      title: p.title,
      abstract: p.abstract,
      published: p.published,
      authors: [...p.authors],
      categories: [...p.categories],
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

/** arXiv Atom XML レスポンスから論文データを抽出する */
export function parseArxivResponse(xml: string): Paper[] {
  const papers: Paper[] = [];

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch: RegExpExecArray | null;

  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entry = entryMatch[1];

    // arXiv ID (URL から抽出)
    const idUrl = /<id>([\s\S]*?)<\/id>/.exec(entry)?.[1]?.trim() ?? '';
    const arxiv_id = idUrl.replace('http://arxiv.org/abs/', '');

    // タイトル
    const title = (/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? '')
      .trim()
      .replaceAll(/\s+/g, ' ');

    // 要約
    const abstract = (/<summary>([\s\S]*?)<\/summary>/.exec(entry)?.[1] ?? '')
      .trim()
      .replaceAll(/\s+/g, ' ');

    // 公開日
    const publishedRaw = /<published>([\s\S]*?)<\/published>/.exec(entry)?.[1]?.trim() ?? '';
    const published = publishedRaw.slice(0, 10);

    // 著者
    const authors: string[] = [];
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      if (authorMatch[1]) authors.push(authorMatch[1].trim());
    }

    // カテゴリ
    const categories: string[] = [];
    const catRegex = /<category[^>]*term="([^"]*)"[^>]*\/>/g;
    let catMatch: RegExpExecArray | null;
    while ((catMatch = catRegex.exec(entry)) !== null) {
      if (catMatch[1]) categories.push(catMatch[1]);
    }

    // PDF URL
    const pdf_url = /<link[^>]*href="([^"]*)"[^>]*title="pdf"[^>]*\/>/.exec(entry)?.[1] ?? '';

    if (arxiv_id && title) {
      papers.push({ arxiv_id, title, abstract, published, authors, categories, pdf_url });
    }
  }

  return papers;
}

export async function collectPapers(env: PaperCollectorEnv): Promise<void> {
  const cronEnabled = env.PAPER_CRON_ENABLED !== undefined
    ? env.PAPER_CRON_ENABLED !== 'false'
    : paperConfig.cronEnabled;

  if (!cronEnabled) {
    console.log('Paper collection is disabled');
    return;
  }

  const { baseUrl, categories, fetchCountPerCategory, lookbackDays, s3Prefix } = paperConfig;
  const today = getTodayString();
  const allPapers: Paper[] = [];
  const seenIds = new Set<string>();

  for (const category of categories) {
    if (allPapers.length > 0) {
      // arXiv レート制限: 3秒間隔
      await new Promise((resolve) => setTimeout(resolve, 3500));
    }

    const query = buildArxivQuery(category, lookbackDays, today);
    const url = `${baseUrl}?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${fetchCountPerCategory}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`arXiv API request failed for ${category}: ${message}`);
      continue;
    }

    if (!response.ok) {
      console.error(`arXiv API error for ${category}: ${response.status} ${response.statusText}`);
      continue;
    }

    const xml = await response.text();
    const papers = parseArxivResponse(xml);

    // 重複排除（論文は複数カテゴリに属する）
    for (const paper of papers) {
      if (!seenIds.has(paper.arxiv_id)) {
        seenIds.add(paper.arxiv_id);
        allPapers.push(paper);
      }
    }

    console.log(`${category}: ${papers.length} papers`);
  }

  if (allPapers.length === 0) {
    console.log('No papers found for the given criteria');
    return;
  }

  console.log(`Fetched ${allPapers.length} unique papers from arXiv`);
  const papers = allPapers;

  const tsv = formatToTsv(papers);
  const jsonl = formatToJsonl(papers);

  const cmsConfig = createCmsConfig({
    S3_DOCS_BUCKET: env.PAPER_S3_BUCKET ?? env.S3_DOCS_BUCKET,
    ANYTIME_AWS_ACCESS_KEY_ID: env.ANYTIME_AWS_ACCESS_KEY_ID,
    ANYTIME_AWS_SECRET_ACCESS_KEY: env.ANYTIME_AWS_SECRET_ACCESS_KEY,
    ANYTIME_AWS_REGION: env.ANYTIME_AWS_REGION,
  });
  const s3Client = createS3Client(cmsConfig);
  const papersConfig = { bucket: cmsConfig.bucket, patentsPrefix: s3Prefix };

  await uploadPatentFile({ fileName: `${today}.tsv`, content: tsv }, s3Client, papersConfig);
  await uploadPatentFile({ fileName: `${today}.jsonl`, content: jsonl }, s3Client, papersConfig);

  console.log(`Uploaded paper files for ${today}`);
}
