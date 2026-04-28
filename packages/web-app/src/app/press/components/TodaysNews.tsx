'use client';

import DOMPurify from 'dompurify';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { NewsArticle } from '../../api/news/route';
import styles from '../press.module.css';
import { formatRank, formatRelativeTime } from '../utils';

export function TodaysNews() {
    const [articles, setArticles] = useState<NewsArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const t = useTranslations('press.news');

    useEffect(() => {
        let cancelled = false;

        fetch('/api/news')
            .then((r) => r.json())
            .then((data: { articles?: NewsArticle[] }) => {
                if (!cancelled) setArticles(data.articles ?? []);
            })
            .catch((err: unknown) => {
                console.error(
                    '[TodaysNews] fetch failed:',
                    err instanceof Error ? err.stack : String(err),
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section id="news" className={styles.newsfront}>
            <div className={styles.newsfrontHeader}>
                <span className={styles.newsfrontLabel}>{t('label')}</span>
                <h2 className={styles.newsfrontHeading}>{t('heading')}</h2>
                <span className={styles.newsfrontMeta}>{t('poweredBy')}</span>
            </div>

            {loading ? (
                <div className={styles.newsfrontSkeleton}>
                    {[0, 1, 2].map((i) => (
                        <div key={i} className={styles.newsfrontSkeletonItem} />
                    ))}
                </div>
            ) : (
                <div className={styles.newsfrontColumns}>
                    {articles.map((article, i) => (
                        <article key={article.id} className={styles.newsfrontArticle}>
                            <span className={styles.newsfrontKicker}>
                                {formatRank(i + 1)} · {article.section}
                            </span>
                            <h3 className={styles.newsfrontHeadline}>
                                <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.newsfrontLink}
                                >
                                    {article.title}
                                </a>
                            </h3>
                            {article.description && (
                                <p
                                    className={styles.newsfrontLead}
                                    dangerouslySetInnerHTML={{
                                        __html: DOMPurify.sanitize(article.description),
                                    }}
                                />
                            )}
                            <div className={styles.newsfrontByline}>
                                <span>{article.author}</span>
                                <span aria-hidden="true">·</span>
                                <time dateTime={article.publishedAt}>
                                    {formatRelativeTime(article.publishedAt)}
                                </time>
                                <span aria-hidden="true">·</span>
                                <span>{article.source}</span>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
