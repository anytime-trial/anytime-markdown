'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import styles from '../press.module.css';

const LOOP_MS = 60_000;       // one full caravan animation cycle
const SHOW_MS = LOOP_MS * 2;  // visible for 2 loops (~2 min)

const PALM_TRUNK_PATH = 'M16 56 L20 56 L19 28 L17 28 Z';
const PALM_FROND_PATHS = [
  'M18 28 Q5 22 1 26',
  'M18 28 Q8 14 4 10',
  'M18 28 Q18 12 18 6',
  'M18 28 Q28 14 32 10',
  'M18 28 Q31 22 35 26',
] as const;

// [left% within 200%-wide wrapper, bottom px]
// left = translateX / 2400 * 100%
// bottom = (80 - (translateY + 38)) / 80 * 88
const CAMELS: ReadonlyArray<readonly [string, number]> = [
  ['17.5%', 13],
  ['67.5%', 13],
];

// Oases at ~44% and 94% (offset by 50% for seamless loop)
const OASES: ReadonlyArray<readonly [string, number]> = [
  ['44%', 14],
  ['94%', 14],
];

const HOOFPRINTS = [60, 200, 320, 540, 700, 940, 1080, 1240, 1450, 1740, 1880, 2160];

export function Caravan() {
  const [oasisVisible, setOasisVisible] = useState(false);
  const t = useTranslations('press.caravan');

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;

    function scheduleShow(delayMs: number) {
      showTimer = setTimeout(() => {
        setOasisVisible(true);
        hideTimer = setTimeout(() => {
          setOasisVisible(false);
          // Next appearance: random 40-60 min after hide
          scheduleShow(2_400_000 + Math.random() * 1_200_000);
        }, SHOW_MS);
      }, delayMs);
    }

    // First appearance: random within the first hour
    scheduleShow(Math.random() * 3_600_000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div className={styles.caravan}>
      <span className={styles.caravanTick}>{t('tick')}</span>
      <svg viewBox="0 0 2400 80" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0,60 Q200,52 400,58 T800,54 T1200,60 T1600,52 T2000,58 T2400,56 L2400,80 L0,80 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M0,68 Q300,62 600,66 T1200,64 T1800,68 T2400,64"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeDasharray="3 5"
          className={styles.caravanMuted}
        />
        <g fill="currentColor" className={styles.caravanMuted}>
          {HOOFPRINTS.map((cx) => (
            <circle key={cx} cx={cx} cy="74" r="1.4" />
          ))}
        </g>
      </svg>
      <div className={styles.caravanCamels} aria-hidden="true">
        {CAMELS.map(([left, bottom]) => (
          <span
            key={left}
            className={styles.caravanCamelItem}
            style={{ left, bottom }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/camel_transparent.png"
              alt=""
              width={30}
              height={30}
              className={styles.caravanCamelImg}
            />
          </span>
        ))}
        {OASES.map(([left, bottom]) => (
          <span
            key={left}
            className={`${styles.caravanOasisItem}${oasisVisible ? ` ${styles.caravanOasisVisible}` : ''}`}
            style={{ left, bottom }}
          >
            <svg viewBox="0 0 36 58" width="36" height="58" fill="none">
              <ellipse cx="18" cy="54" rx="12" ry="3.5" fill="currentColor" className={styles.caravanMuted} opacity="0.5" />
              <path d={PALM_TRUNK_PATH} fill="currentColor" />
              {PALM_FROND_PATHS.map((d) => (
                <path key={d} d={d} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              ))}
            </svg>
          </span>
        ))}
      </div>
      <span className={styles.caravanSun1} aria-hidden="true" />
      <span className={styles.caravanSun2} aria-hidden="true" />
    </div>
  );
}
