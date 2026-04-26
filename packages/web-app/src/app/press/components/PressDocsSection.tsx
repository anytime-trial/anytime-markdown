'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { LayoutCategory, LayoutData } from '../../../types/layout';
import styles from '../press.module.css';

function resolveHref(item: LayoutCategory['items'][number]): string {
    if (item.url) return item.url;
    return `/docs/view?key=${encodeURIComponent(item.docKey)}`;
}

function CategoryColumn({ category }: Readonly<{ category: LayoutCategory }>) {
    return (
        <div>
            <h4 className={styles.pressDocs_colTitle}>{category.title}</h4>
            <ul className={styles.pressDocs_itemList}>
                {category.items.map((item) => {
                    const href = resolveHref(item);
                    const isExternal = !!item.url;
                    return (
                        <li key={item.docKey} className={styles.pressDocs_item}>
                            <a
                                href={href}
                                target={isExternal ? '_blank' : undefined}
                                rel={isExternal ? 'noopener noreferrer' : undefined}
                                className={styles.pressDocs_link}
                            >
                                {item.displayName}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export function PressDocsSection() {
    const t = useTranslations('press.pressDocs');
    const [data, setData] = useState<LayoutData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/press-docs')
            .then((r) => r.json())
            .then((d: LayoutData) => {
                if (!cancelled) setData(d);
            })
            .catch((err: unknown) => {
                console.error('[PressDocsSection] fetch failed:', err instanceof Error ? err.stack : String(err));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    if (!loading && !data?.categories.length) return null;

    return (
        <section className={styles.pressDocs}>
            <div className={styles.pressDocs_header}>
                <span className={styles.pressDocs_label}>{t('label')}</span>
                <h2 className={styles.pressDocs_heading}>{t('heading')}</h2>
            </div>

            {loading ? (
                <div className={styles.pressDocs_skeleton}>
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className={styles.pressDocs_skeletonCol} />
                    ))}
                </div>
            ) : (
                <div className={styles.pressDocs_grid}>
                    {data?.categories.map((cat) => (
                        <CategoryColumn key={cat.id} category={cat} />
                    ))}
                </div>
            )}
        </section>
    );
}
