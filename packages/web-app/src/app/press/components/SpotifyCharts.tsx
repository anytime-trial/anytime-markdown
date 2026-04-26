'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import styles from '../press.module.css';

interface SpotifyAlbum {
    id: string;
    name: string;
    artists: { name: string }[];
    images: { url: string; width: number; height: number }[];
    release_date: string;
    external_urls: { spotify: string };
}

async function fetchReleases(market: string): Promise<SpotifyAlbum[]> {
    const res = await fetch(`/api/spotify/new-releases?market=${market}`);
    const data = (await res.json()) as { albums?: SpotifyAlbum[]; error?: string };
    if (data.error ?? !data.albums?.length) return [];
    return data.albums.slice(0, 5);
}

interface ChartColumnProps {
    label: string;
    albums: SpotifyAlbum[];
    loading: boolean;
}

function ChartColumn({ label, albums, loading }: Readonly<ChartColumnProps>) {
    return (
        <div className={styles.chartsColumn}>
            <div className={styles.chartsColumnHeader}>
                <span className={styles.chartsColumnLabel}>{label}</span>
            </div>
            {loading ? (
                <ol className={styles.chartsList} aria-busy="true">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <li key={i} className={styles.chartsItemSkeleton} />
                    ))}
                </ol>
            ) : (
                <ol className={styles.chartsList}>
                    {albums.map((album, i) => {
                        const thumb =
                            album.images.find((img) => img.width <= 300)?.url ??
                            album.images[0]?.url;
                        const artists = album.artists.map((a) => a.name).join(', ');
                        return (
                            <li key={album.id} className={styles.chartsItem}>
                                <span className={styles.chartsRank} aria-label={`${i + 1}位`}>
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                {thumb && (
                                    <img
                                        src={thumb}
                                        alt={`${album.name} ジャケット`}
                                        className={styles.chartsArt}
                                        width={48}
                                        height={48}
                                    />
                                )}
                                <div className={styles.chartsInfo}>
                                    <a
                                        href={album.external_urls.spotify}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.chartsTrackName}
                                    >
                                        {album.name}
                                    </a>
                                    <span className={styles.chartsArtist}>{artists}</span>
                                </div>
                                <span className={styles.chartsDate}>{album.release_date}</span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}

export function SpotifyCharts() {
    const [jpAlbums, setJpAlbums] = useState<SpotifyAlbum[]>([]);
    const [globalAlbums, setGlobalAlbums] = useState<SpotifyAlbum[]>([]);
    const [loading, setLoading] = useState(true);
    const [unavailable, setUnavailable] = useState(false);
    const t = useTranslations('press.charts');

    useEffect(() => {
        let cancelled = false;

        Promise.all([fetchReleases('JP'), fetchReleases('US')])
            .then(([jp, global]) => {
                if (!cancelled) {
                    if (!jp.length && !global.length) {
                        setUnavailable(true);
                    } else {
                        setJpAlbums(jp);
                        setGlobalAlbums(global);
                    }
                }
            })
            .catch((err: unknown) => {
                console.error(
                    '[SpotifyCharts] fetch failed:',
                    err instanceof Error ? err.stack : String(err),
                );
                if (!cancelled) setUnavailable(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (!loading && unavailable) return null;

    return (
        <section className={styles.charts}>
            <div className={styles.chartsHeader}>
                <span className={styles.chartsLabel}>{t('label')}</span>
                <h2 className={styles.chartsHeading}>{t('heading')}</h2>
                <span className={styles.chartsMeta}>{t('poweredBy')}</span>
            </div>
            <div className={styles.chartsBody}>
                <ChartColumn label={t('labelJp')} albums={jpAlbums} loading={loading} />
                <ChartColumn label={t('labelGlobal')} albums={globalAlbums} loading={loading} />
            </div>
        </section>
    );
}
