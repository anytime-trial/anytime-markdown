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
  // 量産しないよう 404 にする。
  //
  // notFound() は描画開始より前（このページ関数が JSX を返す前）に呼ぶ必要がある。
  // 上位に Suspense 境界があるとシェルがステータス 200 で送出済みになり、あとから
  // ステータスを変えられない（かつて `app/[locale]/loading.tsx` がその境界を作っており、
  // この経路は 404 ページを描画しながら 200 を返していた）。ステータスの退行は
  // `e2e/http-status.spec.ts` が実測で押さえる。
  if (!isTopicSlug(topic)) notFound();

  return (
    <>
      <LandingHeader />
      <TopicLanding slug={topic} locale={toLocale(rawLocale)} />
    </>
  );
}
