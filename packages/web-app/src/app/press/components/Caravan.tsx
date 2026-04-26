import { useTranslations } from 'next-intl';

import styles from '../press.module.css';

const CAMEL_PATH =
  'M0 28 L4 18 L8 14 L8 8 Q12 2 18 4 L20 8 L18 14 L24 16 L34 12 L38 18 L42 18 L42 22 L46 28 L42 32 L42 38 L40 38 L38 32 L20 32 L18 38 L16 38 L14 32 L4 32 Z';

// [left% within 200%-wide wrapper, bottom px]
// left = translateX / 2400 * 100%
// bottom = (80 - (translateY + 38)) / 80 * 88
const CAMELS: ReadonlyArray<readonly [string, number]> = [
  ['5%', 15],        // translate(120, 28)
  ['17.5%', 13],     // translate(420, 30)
  ['34.17%', 11],    // translate(820, 32)
  ['55%', 15],       // translate(1320, 28)
  ['67.5%', 13],     // translate(1620, 30)
  ['84.17%', 11],    // translate(2020, 32)
];

const HOOFPRINTS = [60, 200, 320, 540, 700, 940, 1080, 1240, 1450, 1740, 1880, 2160];

export function Caravan() {
  const t = useTranslations('press.caravan');
  return (
    <div className={styles.caravan}>
      <span className={styles.caravanTick}>{t('tick')}</span>
      <svg viewBox="0 0 2400 80" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0,60 Q200,52 400,58 T800,54 T1200,60 T1600,52 T2000,58 T2400,56 L2400,80 L0,80 Z"
          fill="none"
          stroke="#15110A"
          strokeWidth="1"
        />
        <path
          d="M0,68 Q300,62 600,66 T1200,64 T1800,68 T2400,64"
          fill="none"
          stroke="#8A7C66"
          strokeWidth="0.8"
          strokeDasharray="3 5"
        />
        <g fill="#8A7C66">
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
            <svg viewBox="0 0 46 38" width="46" height="38" fill="#15110A">
              <path d={CAMEL_PATH} />
            </svg>
          </span>
        ))}
      </div>
      <span className={styles.caravanSun1} aria-hidden="true" />
      <span className={styles.caravanSun2} aria-hidden="true" />
    </div>
  );
}
