'use client';

import { useTranslations } from 'next-intl';

import styles from '../press.module.css';
import { TRAFFIC_LIGHT_COLORS } from './constants';

/** 紹介対象アプリ。ランディングからの導線はトップ 1 本に絞る */
const TRAVEL_APP_URL = 'https://travel.anytime-trial.com/';

const FEATURE_KEYS = ['feature1', 'feature2', 'feature3'] as const;

/**
 * 新作アプリ（街道マップ）の紹介欄。
 *
 * プレビューは本番サイトの live iframe。地図が WebGL のホイールズームを持つため、
 * ランディング上でスクロールを奪わないよう inert で操作を殺し「動く縮小版」に留める。
 * 実際に触る導線は CTA ボタン（別タブ）だけに集約する。
 */
export function TravelApp() {
    const t = useTranslations('press.travelApp');

    return (
        <section className={styles.travel}>
            <div className={styles.travelHeader}>
                <span className={styles.travelLabel}>{t('label')}</span>
                <h2 className={styles.travelHeading}>{t('heading')}</h2>
                <span className={styles.travelPoweredBy}>{t('poweredBy')}</span>
            </div>

            <div className={styles.travelBody}>
                <div className={styles.travelPreviewStack}>
                    <div className={styles.travelPreview}>
                        <div className={styles.trailFrameBar}>
                            {TRAFFIC_LIGHT_COLORS.map((color) => (
                                <span
                                    key={color}
                                    className={styles.trailFrameDot}
                                    style={{ background: color }}
                                    aria-hidden="true"
                                />
                            ))}
                            <span className={styles.trailFrameTitle}>{t('frameTitle')}</span>
                        </div>
                        {/* inert: プレビュー内の地図へフォーカス・ホイールが吸われないようにする */}
                        <div className={styles.travelFrameBody} inert>
                            <iframe
                                className={styles.travelIframe}
                                src={TRAVEL_APP_URL}
                                title={t('previewTitle')}
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        </div>
                    </div>
                    <p className={styles.travelPreviewNote}>{t('previewNote')}</p>
                </div>

                <div className={styles.travelMain}>
                    <p className={styles.travelLede}>{t('lede')}</p>
                    <dl className={styles.travelList}>
                        {FEATURE_KEYS.map((key) => (
                            <div key={key} className={styles.travelListItem}>
                                <dt className={styles.travelTerm}>{t(`${key}Head`)}</dt>
                                <dd className={styles.travelDesc}>{t(`${key}Body`)}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className={styles.travelActions}>
                        <a
                            className={styles.btn}
                            href={TRAVEL_APP_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {t('cta')} <span className={styles.btnArrow}>→</span>
                        </a>
                    </div>
                    <p className={styles.travelCredit}>{t('credit')}</p>
                </div>
            </div>
        </section>
    );
}
