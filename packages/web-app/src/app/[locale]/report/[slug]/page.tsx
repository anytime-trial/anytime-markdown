import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { buildSingleSourceAlternates, singleSourceHref } from '../../../../lib/localeAlternates';
import { getReportBySlug, listReports } from '../../../../lib/reportClient';
import { buildNavigation } from '../../../../lib/reportUtils';
import { SITE_NAME } from '../../../../lib/siteMetadata';
import type { ReportMeta } from '../../../../types/report';
import ReportDetailBody from './ReportDetailBody';

export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const report = await getReportBySlug(slug);

  if (!report) {
    return { title: 'Report Not Found', robots: { index: false, follow: true } };
  }

  return {
    title: report.meta.title,
    description: report.meta.excerpt,
    // 記事本文は S3 上の単一ソースで /en でも同じ本文を返す。hreflang を出すと
    // 1 本の記事を 2 URL で重複申告することになるため、canonical を ja へ寄せる。
    alternates: buildSingleSourceAlternates(`/report/${slug}`),
    openGraph: {
      title: report.meta.title,
      description: report.meta.excerpt,
      type: 'article',
      url: singleSourceHref(`/report/${slug}`),
      publishedTime: report.meta.date,
      authors: report.meta.author ? [report.meta.author] : undefined,
    },
  };
}

/**
 * サムネイルは相対パスの場合 S3 / CloudFront の解決が要るため、絶対 URL のときだけ採用し、
 * それ以外はサイト共通の OG 画像へ縮退する（誤った画像 URL を構造化データへ載せない）。
 */
function resolveArticleImage(thumbnail: string | undefined): string {
  if (thumbnail && /^https?:\/\//.test(thumbnail)) return thumbnail;
  return `${BASE_URL}/opengraph-image`;
}

function buildArticleJsonLd(meta: ReportMeta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.excerpt,
    datePublished: meta.date,
    dateModified: meta.date,
    image: resolveArticleImage(meta.thumbnail),
    articleSection: meta.category,
    author: {
      '@type': meta.author ? 'Person' : 'Organization',
      name: meta.author ?? SITE_NAME,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: BASE_URL,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${BASE_URL}/report/${meta.slug}`,
    },
  };
}

function buildBreadcrumbJsonLd(meta: ReportMeta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Report', item: `${BASE_URL}/report` },
      { '@type': 'ListItem', position: 3, name: meta.title, item: `${BASE_URL}/report/${meta.slug}` },
    ],
  };
}

export default async function ReportDetailPage({ params }: Readonly<Props>) {
  const { slug } = await params;

  let report: { meta: ReportMeta; content: string } | null = null;
  let nav = { prev: null as ReportMeta | null, next: null as ReportMeta | null };
  /** 記事一覧を引けたか。引けていれば供給元は到達可能で、無い slug は「存在しない」と言い切れる */
  let sourceReachable = false;

  try {
    const [reportResult, allReports] = await Promise.all([
      getReportBySlug(slug),
      listReports(),
    ]);
    report = reportResult;
    sourceReachable = allReports.length > 0;
    if (report) {
      nav = buildNavigation(allReports, slug);
    }
  } catch (e: unknown) {
    console.warn(
      `[${new Date().toISOString()}] [WARN] [/report/${slug}] failed to load report:`,
      e instanceof Error ? e.stack : e,
    );
  }

  // 存在しない記事は 404 を返す。ここで返さないと、無い slug が「読み込みエラー」の
  // 本文とともに 200 で返り、検索エンジンには中身のあるページとして扱われる。
  //
  // Why not: `report === null` だけで 404 にしない。`getReportBySlug` は S3 バケット未設定
  // でも null を返すため、設定不備や供給元の障害が「全記事が存在しない」に化ける。一覧を
  // 引けたときだけ「無い」と断定し、引けなかったときは従来どおりエラー表示（200）へ落とす。
  //
  // frontmatter が壊れた記事もここで 404 になるが、これは矛盾しない。`listReports` が
  // 同じスキーマで検証して落とすため、そうした記事は一覧にも sitemap にも現れない
  // （どこからも案内していない URL に「無い」と答えることになる）。
  //
  // notFound() はここ（描画開始前）で呼ぶ必要がある。上位に Suspense 境界があると
  // シェルが 200 で送出済みになり、ステータスを変えられない（ソフト 404）。
  if (!report && sourceReachable) {
    notFound();
  }

  return (
    <>
      {report && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(buildArticleJsonLd(report.meta)) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd(report.meta)) }}
          />
        </>
      )}
      <ReportDetailBody report={report} prev={nav.prev} next={nav.next} />
    </>
  );
}
