import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { buildAlternates, localeHref, toLocale } from '../../../../lib/localeAlternates';
import { socialTitle } from '../../../../lib/siteMetadata';
import LandingHeader from '../../components/LandingHeader';
import { isTopicSlug, TOPIC_SLUGS, topicPath } from '../topics';
import { TopicLanding } from './TopicLanding';

type TopicParams = Readonly<{ params: Promise<{ locale: string; topic: string }> }>;

/** 出力するトピックを一覧で固定する。レジストリに無い slug はビルド対象にならない */
export function generateStaticParams() {
  return TOPIC_SLUGS.map((topic) => ({ topic }));
}

export async function generateMetadata({ params }: TopicParams): Promise<Metadata> {
  const { locale: rawLocale, topic } = await params;
  const locale = toLocale(rawLocale);
  if (!isTopicSlug(topic)) return {};

  const t = await getTranslations({ locale, namespace: 'EditorTopics' });
  const title = t(`${topic}.metaTitle`);
  const description = t(`${topic}.metaDescription`);
  const path = topicPath(topic);

  return {
    title,
    description,
    // 親（/markdown）の canonical を継承させない。LP ごとに自分の URL を名乗る
    alternates: buildAlternates(path, locale),
    openGraph: {
      title: socialTitle(title),
      description: t(`${topic}.socialDescription`),
      url: localeHref(path, locale),
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle(title),
      description: t(`${topic}.socialDescription`),
    },
  };
}

export default async function MarkdownTopicPage({ params }: TopicParams) {
  const { locale: rawLocale, topic } = await params;
  // `[topic]` は任意の文字列を受け取る。レジストリに無い slug で薄いページを
  // 量産しないよう 404 ページへ落とす。
  //
  // 既知の制約: この経路の HTTP ステータスは 200 になる（実測。`/report/<未知>` も同じで、
  // `[locale]` 配下で notFound() を呼ぶ全ルートに共通する既存の挙動）。next-intl の
  // middleware が rewrite した先の 404 がステータスとして伝わらない。`dynamicParams = false`
  // でも変わらないことを実測済み。ソフト 404 の解消はルーティング全体の課題として別に扱う。
  if (!isTopicSlug(topic)) notFound();

  return (
    <>
      <LandingHeader />
      <TopicLanding slug={topic} locale={toLocale(rawLocale)} />
    </>
  );
}
