import { paperConfig } from './paperConfig.js';

export interface PaperRankingEnv {
  PAPER_S3_BUCKET?: string;
  OPENALEX_MAILTO: string;
  S3_DOCS_BUCKET: string;
  ANYTIME_AWS_ACCESS_KEY_ID: string;
  ANYTIME_AWS_SECRET_ACCESS_KEY: string;
  ANYTIME_AWS_REGION?: string;
}

/** @deprecated Use PaperRankingEnv instead */
export type PaperCollectorEnv = PaperRankingEnv;

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
const RANKING_TSV_HEADER = 'rank\tcited_by_count\tarxiv_id\tpublication_date\tsubfield\tauthors\ttitle\tpdf_url';
const WRITTEN_TSV_HEADER = 'arxiv_id\twritten_date';

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
 * 当月の初日を返す（先月末の翌日）。
 * 例: 2026-04-15 → 2026-04-01
 */
function getFirstDayOfMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

/**
 * 先月末の日付を返す。
 * 例: 2026-04-15 → 2026-03-31
 */
function getLastDayOfPreviousMonth(today: string): string {
  const date = new Date(getFirstDayOfMonth(today));
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * OpenAlex API の URL を構築する。
 * 対象期間: 当月を除く過去 N ヶ月（例: 4月実行 → 1月1日〜3月31日）
 */
export function buildOpenAlexUrl(
  months: number,
  fetchCount: number,
  today: string,
  mailto: string,
): string {
  const toDate = getLastDayOfPreviousMonth(today);
  const fromDate = computeFromDate(getFirstDayOfMonth(today), months);
  const { openAlexBaseUrl, openAlexArxivSourceId } = paperConfig;
  const filter = [
    `from_publication_date:${fromDate}`,
    `to_publication_date:${toDate}`,
    `locations.source.id:${openAlexArxivSourceId}`,
  ].join(',');

  return `${openAlexBaseUrl}/works?filter=${filter}&sort=cited_by_count:desc&per_page=${fetchCount}&mailto=${encodeURIComponent(mailto)}`;
}

/**
 * OpenAlex JSON レスポンスから論文データを抽出する。
 */
export function parseOpenAlexResponse(
  results: readonly OpenAlexWork[],
): RankedPaper[] {
  return results.flatMap((work) => {
    const landingUrl = work.primary_location?.landing_page_url ?? '';
    if (!landingUrl.startsWith(ARXIV_ABS_PREFIX)) {
      return [];
    }

    const arxivId = landingUrl.slice(ARXIV_ABS_PREFIX.length);

    const authors = work.authorships
      .slice(0, MAX_AUTHORS)
      .map((a) => a.author.display_name);

    const subfield = work.primary_topic?.subfield?.display_name ?? '';
    const pdfUrl = `${ARXIV_PDF_PREFIX}${arxivId}`;

    return [{
      arxiv_id: arxivId,
      title: work.title,
      cited_by_count: work.cited_by_count,
      publication_date: work.publication_date,
      authors,
      subfield,
      pdf_url: pdfUrl,
    }];
  });
}

/**
 * RankedPaper[] を TSV 形式に変換する。
 */
export function formatRankingToTsv(papers: readonly RankedPaper[]): string {
  if (papers.length === 0) {
    return RANKING_TSV_HEADER;
  }

  const rows = papers.map((p, i) => {
    const authors = p.authors.join('; ').replaceAll('\t', ' ');
    const title = p.title.replaceAll('\t', ' ').replaceAll('\n', ' ');
    return `${i + 1}\t${p.cited_by_count}\t${p.arxiv_id}\t${p.publication_date}\t${p.subfield}\t${authors}\t${title}\t${p.pdf_url}`;
  });

  return [RANKING_TSV_HEADER, ...rows].join('\n');
}

/**
 * OpenAlex から論文ランキングを取得する。
 * サイトへの fetch のみ行い、S3 保存はしない。
 */
export async function fetchRankingFromOpenAlex(
  months: number,
  fetchCount: number,
  today: string,
  mailto: string,
): Promise<RankedPaper[]> {
  // arXiv 以外の論文を除外するため、多めに取得してフィルタ後に切り詰める
  const overFetchCount = fetchCount * 3;
  const url = buildOpenAlexUrl(months, overFetchCount, today, mailto);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenAlex API error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json() as { results: OpenAlexWork[] };
  return parseOpenAlexResponse(data.results).slice(0, fetchCount);
}

/**
 * 記事作成済みリスト（TSV）をパースする。
 * TSV形式: arxiv_id\twritten_date
 * ヘッダ行あり。
 */
export function parseWrittenList(tsv: string): Set<string> {
  const ids = new Set<string>();
  const lines = tsv.split('\n').slice(1); // skip header
  for (const line of lines) {
    const id = line.split('\t')[0]?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * 記事作成済みリストに追加してTSV文字列を返す。
 * 既存のTSV文字列 + 新しいarxiv_id + 日付 → 更新後のTSV文字列
 */
export function addToWrittenList(existingTsv: string, arxivId: string, writtenDate: string): string {
  if (!existingTsv || existingTsv.trim() === '' || existingTsv.trim() === WRITTEN_TSV_HEADER) {
    return `${WRITTEN_TSV_HEADER}\n${arxivId}\t${writtenDate}`;
  }
  return `${existingTsv.trimEnd()}\n${arxivId}\t${writtenDate}`;
}
