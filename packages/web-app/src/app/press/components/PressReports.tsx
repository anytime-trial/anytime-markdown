'use client';

import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import type { PressReportsResponse } from '../../api/press-reports/route';
import type { ReportMeta } from '../../../types/report';
import styles from '../press.module.css';

function ReportCard({ report, label }: Readonly<{ report: ReportMeta; label: string }>) {
    return (
        <div className={styles.pressReportCard}>
            <span className={styles.pressReportCardLabel}>{label}</span>
            <h3 className={styles.pressReportCardTitle}>
                <a href={`/report/${report.slug}`} className={styles.pressReportCardLink}>
                    {report.title}
                </a>
            </h3>
            {report.excerpt && (
                <p className={styles.pressReportCardExcerpt}>{report.excerpt}</p>
            )}
            <div className={styles.pressReportCardMeta}>
                <time dateTime={report.date}>{report.date}</time>
                {report.author && (
                    <>
                        <span aria-hidden="true">·</span>
                        <span>{report.author}</span>
                    </>
                )}
            </div>
        </div>
    );
}

export function PressReports() {
    const t = useTranslations('press.pressReports');
    const [data, setData] = useState<PressReportsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/press-reports')
            .then((r) => r.json())
            .then((d: PressReportsResponse) => {
                if (!cancelled) setData(d);
            })
            .catch((err: unknown) => {
                console.error('[PressReports] fetch failed:', err instanceof Error ? err.stack : String(err));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    if (!loading && !data?.daily && !data?.weekly) return null;

    return (
        <section className={styles.pressReports}>
            <div className={styles.pressReportsHeader}>
                <span className={styles.pressReportsLabel}>{t('label')}</span>
                <h2 className={styles.pressReportsHeading}>{t('heading')}</h2>
            </div>
            {loading ? (
                <div className={styles.pressReportsSkeleton}>
                    <div className={styles.pressReportsSkeletonItem} />
                    <div className={styles.pressReportsSkeletonItem} />
                </div>
            ) : (
                <div className={styles.pressReportsGrid}>
                    {data?.daily && (
                        <ReportCard report={data.daily} label={t('labelDaily')} />
                    )}
                    {data?.weekly && (
                        <ReportCard report={data.weekly} label={t('labelWeekly')} />
                    )}
                </div>
            )}
        </section>
    );
}
