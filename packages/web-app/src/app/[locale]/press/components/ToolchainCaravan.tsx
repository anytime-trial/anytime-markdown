import { useTranslations } from 'next-intl';

import styles from '../press.module.css';
import { TRAFFIC_LIGHT_COLORS } from './constants';

/** Caravan.tsx のオアシスと同じヤシの木形状（隊商のモチーフを図解でも共有する） */
const PALM_TRUNK_PATH = 'M16 56 L20 56 L19 28 L17 28 Z';
const PALM_FROND_PATHS = [
  'M18 28 Q5 22 1 26',
  'M18 28 Q8 14 4 10',
  'M18 28 Q18 12 18 6',
  'M18 28 Q28 14 32 10',
  'M18 28 Q31 22 35 26',
] as const;

/** ラクダの後ろに続く足跡。route パス上の座標 */
const HOOFPRINTS: ReadonlyArray<readonly [number, number]> = [
  [130, 219],
  [148, 225],
  [166, 230],
  [184, 234],
  [202, 236],
];

export function ToolchainCaravan() {
  const t = useTranslations('press.toolchain');
  return (
    <figure className={styles.toolchain}>
      <div className={styles.toolchainFrame}>
        <div className={styles.trailFrameBar}>
          {TRAFFIC_LIGHT_COLORS.map((color) => (
            <span
              key={color}
              className={styles.trailFrameDot}
              style={{ background: color }}
              aria-hidden="true"
            />
          ))}
          <span className={styles.trailFrameTitle}>{t('host')}</span>
        </div>
        <svg
          className={styles.toolchainScene}
          viewBox="0 120 560 182"
          role="img"
          aria-label={t('figureLabel')}
        >
          {/* 地面（奥の稜線と手前の砂丘） */}
          <path
            d="M0,236 Q120,224 240,232 T480,228 T560,234"
            className={styles.toolchainRule}
            fill="none"
            strokeDasharray="4 6"
          />
          <path d="M0,254 Q140,244 280,252 T560,248" className={styles.toolchainRule} fill="none" />

          {/* 設計書 ＝ 目的地までの地図 */}
          <path d="M26,170 L116,164 L120,228 L30,234 Z" className={styles.toolchainSheet} />
          <path d="M74,166 L78,231" className={styles.toolchainHair} fill="none" />
          <path
            d="M44,222 C58,204 76,208 88,192 C94,184 100,180 104,176"
            className={styles.toolchainAccentLine}
            fill="none"
            strokeDasharray="3 4"
          />
          <path d="M100,172 L110,180 M110,172 L100,180" className={styles.toolchainAccentLine} fill="none" />

          {/* 地図から目的地へ延びるルート */}
          <path
            d="M118,214 C170,236 205,240 250,238 C300,236 350,244 400,246 C436,247 458,249 478,252"
            className={styles.toolchainRule}
            fill="none"
            strokeDasharray="5 6"
          />
          <path d="M462,249 L450,244 L450,254 Z" className={styles.toolchainRuleFill} />

          {/* 足跡 ＝ Anytime Trail の記録 */}
          <g className={styles.toolchainPrints} aria-hidden="true">
            {HOOFPRINTS.map(([cx, cy]) => (
              <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="3.4" ry="2.2" />
            ))}
          </g>

          {/* 足跡から地図へ戻る帰還線（ずれの検知 → 地図の描き直し） */}
          <path
            d="M206,250 C188,274 118,272 88,250"
            className={styles.toolchainAccentLine}
            fill="none"
            strokeDasharray="4 4"
          />
          <path d="M88,242 L83,252 L93,252 Z" className={styles.toolchainAccentFill} />

          {/* ラクダ ＝ AI エージェント */}
          <image href="/images/camel_transparent.png" x="208" y="176" width="84" height="66" />

          {/* オアシス ＝ プロダクト（目的地） */}
          <ellipse cx="488" cy="253" rx="30" ry="5" className={styles.toolchainHair} fill="none" />
          <g transform="translate(470 192)" className={styles.toolchainPalm}>
            <path d={PALM_TRUNK_PATH} />
            {PALM_FROND_PATHS.map((d) => (
              <path key={d} d={d} fill="none" strokeWidth="3" strokeLinecap="round" />
            ))}
          </g>

          {/* ラベル */}
          <text x="73" y="140" textAnchor="middle" className={styles.toolchainTitleText}>
            {t('specTitle')}
          </text>
          <text x="73" y="153" textAnchor="middle" className={styles.toolchainSubText}>
            {t('specSub')}
          </text>
          <text x="250" y="150" textAnchor="middle" className={styles.toolchainTitleText}>
            {t('agentTitle')}
          </text>
          <text x="250" y="163" textAnchor="middle" className={styles.toolchainSubText}>
            {t('agentSub')}
          </text>
          <text x="488" y="148" textAnchor="middle" className={styles.toolchainTitleText}>
            {t('productTitle')}
          </text>
          <text x="488" y="161" textAnchor="middle" className={styles.toolchainSubText}>
            {t('productSub')}
          </text>
          <text x="150" y="288" textAnchor="middle" className={styles.toolchainMicroText}>
            {t('printsLabel')}
          </text>
        </svg>
      </div>
      <p className={styles.processReturn}>
        <span className={styles.processReturnGlyph} aria-hidden="true">
          ↺
        </span>
        {t('return')}
      </p>
      <figcaption className={styles.processCaption}>{t('caption')}</figcaption>
    </figure>
  );
}
