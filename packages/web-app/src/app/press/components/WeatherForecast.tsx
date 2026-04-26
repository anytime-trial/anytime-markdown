'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { WeatherCity } from '../../api/weather/route';
import styles from '../press.module.css';

export function WeatherForecast() {
    const [cities, setCities] = useState<WeatherCity[]>([]);
    const [loading, setLoading] = useState(true);
    const t = useTranslations('press.weather');
    const locale = useLocale();

    useEffect(() => {
        let cancelled = false;

        fetch('/api/weather')
            .then((r) => r.json())
            .then((data: { cities?: WeatherCity[] }) => {
                if (!cancelled) setCities(data.cities ?? []);
            })
            .catch((err: unknown) => {
                console.error(
                    '[WeatherForecast] fetch failed:',
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
        <section className={styles.weather}>
            <div className={styles.weatherHeader}>
                <span className={styles.weatherLabel}>{t('label')}</span>
                <h2 className={styles.weatherHeading}>{t('heading')}</h2>
                <span className={styles.weatherMeta}>{t('poweredBy')}</span>
            </div>

            <div className={styles.weatherGrid}>
                {loading
                    ? [0, 1, 2, 3, 4].map((i) => (
                          <div key={i} className={styles.weatherCardSkeleton} />
                      ))
                    : cities.map((city) => (
                          <div key={city.key} className={styles.weatherCard}>
                              <span className={styles.weatherCity}>
                                  {locale === 'ja' ? city.nameJa : city.nameEn}
                              </span>
                              <span className={styles.weatherTemp}>
                                  {city.temp}
                                  <span className={styles.weatherDeg}>°C</span>
                              </span>
                              <span className={styles.weatherCondition}>
                                  {locale === 'ja' ? city.conditionJa : city.conditionEn}
                              </span>
                              <span className={styles.weatherHiLo}>
                                  {city.tempMax}° / {city.tempMin}°
                              </span>
                          </div>
                      ))}
            </div>
        </section>
    );
}
