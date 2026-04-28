'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { TrendingRepo, TrendingResponse } from '../../api/github-trending/route';
import styles from '../press.module.css';
import { formatRank } from '../utils';

function RankingColumn({
    label,
    repos,
}: Readonly<{ label: string; repos: TrendingRepo[] }>) {
    return (
        <div className={styles.ghTrendingColumn}>
            <div className={styles.ghTrendingColumnHeader}>{label}</div>
            <ol className={styles.ghTrendingList}>
                {repos.map((repo, i) => (
                    <li key={repo.id} className={styles.ghTrendingItem}>
                        <span className={styles.ghTrendingRank}>
                            {formatRank(i + 1)}
                        </span>
                        <div className={styles.ghTrendingBody}>
                            <h3 className={styles.ghTrendingName}>
                                <a
                                    href={repo.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.ghTrendingLink}
                                >
                                    <span className={styles.ghTrendingOwner}>{repo.owner}</span>
                                    <span className={styles.ghTrendingSep}>/</span>
                                    {repo.name}
                                </a>
                            </h3>
                            {repo.description && (
                                <p className={styles.ghTrendingDesc}>{repo.description}</p>
                            )}
                            <div className={styles.ghTrendingMeta}>
                                {repo.language && (
                                    <span className={styles.ghTrendingLang}>{repo.language}</span>
                                )}
                                <span className={styles.ghTrendingStars}>★ {repo.stars.toLocaleString()}</span>
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function SkeletonColumn() {
    return (
        <div className={styles.ghTrendingColumn}>
            <div className={`${styles.ghTrendingColumnHeader} ${styles.ghTrendingSkeletonHeader}`} />
            {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.ghTrendingSkeletonItem} />
            ))}
        </div>
    );
}

export function GithubTrending() {
    const t = useTranslations('press.githubTrending');
    const [data, setData] = useState<TrendingResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/github-trending')
            .then((r) => r.json())
            .then((d: TrendingResponse) => {
                if (!cancelled) setData(d);
            })
            .catch((err: unknown) => {
                console.error('[GithubTrending] fetch failed:', err instanceof Error ? err.stack : String(err));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    if (!loading && !data?.daily.length && !data?.weekly.length && !data?.monthly.length) return null;

    return (
        <section className={styles.ghTrending}>
            <div className={styles.ghTrendingHeader}>
                <span className={styles.ghTrendingLabel}>{t('label')}</span>
                <h2 className={styles.ghTrendingHeading}>{t('heading')}</h2>
                <span className={styles.ghTrendingPoweredBy}>{t('poweredBy')}</span>
            </div>

            <div className={styles.ghTrendingColumns}>
                {loading ? (
                    <>
                        <SkeletonColumn />
                        <SkeletonColumn />
                        <SkeletonColumn />
                    </>
                ) : (
                    <>
                        <RankingColumn label={t('labelDaily')} repos={data?.daily ?? []} />
                        <RankingColumn label={t('labelWeekly')} repos={data?.weekly ?? []} />
                        <RankingColumn label={t('labelMonthly')} repos={data?.monthly ?? []} />
                    </>
                )}
            </div>
        </section>
    );
}
