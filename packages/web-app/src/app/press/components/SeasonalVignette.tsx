'use client';

import styles from '../press.module.css';

type Season = 'spring' | 'summer' | 'autumn' | 'winter';

function getSeason(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

// 水墨画風の花びら一枚（上向き、原点を中心）
function InkPetal({ size = 5 }: Readonly<{ size?: number }>) {
  const s = size;
  return (
    <path
      d={`M 0 0 Q ${-s * 0.45} ${-s * 0.6} 0 ${-s} Q ${s * 0.45} ${-s * 0.6} 0 0`}
      fill="currentColor"
    />
  );
}

// 五弁の花（桜・梅）
function InkBlossom({ cx, cy, size = 5, op = 0.28 }: Readonly<{ cx: number; cy: number; size?: number; op?: number }>) {
  return (
    <g transform={`translate(${cx},${cy})`} opacity={op} fill="currentColor">
      {([0, 72, 144, 216, 288] as const).map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <InkPetal size={size} />
        </g>
      ))}
      <circle r={size * 0.22} opacity={0.7} />
    </g>
  );
}

// 散る花びら一枚
function DriftPetal({ cx, cy, size = 3.5, angle = 0, op = 0.14 }: Readonly<{ cx: number; cy: number; size?: number; angle?: number; op?: number }>) {
  return (
    <g transform={`translate(${cx},${cy}) rotate(${angle})`} opacity={op} fill="currentColor">
      <InkPetal size={size} />
    </g>
  );
}

// 春：桜の枝
function SpringMotif() {
  return (
    <>
      {/* 主幹 — 墨の滲み（太め・低透明） */}
      <path d="M 280 70 C 235 56, 190 38, 158 24 C 135 15, 115 9, 98 6"
        stroke="currentColor" strokeWidth={9} strokeLinecap="round" opacity={0.05} />
      {/* 主幹 — 線 */}
      <path d="M 280 70 C 235 56, 190 38, 158 24 C 135 15, 115 9, 98 6"
        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.22} />
      {/* 枝1 */}
      <path d="M 178 28 C 186 17, 194 10, 200 6"
        stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" opacity={0.2} />
      {/* 枝2 */}
      <path d="M 148 23 C 142 14, 140 6, 144 2"
        stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" opacity={0.18} />
      {/* 花 */}
      <InkBlossom cx={200} cy={6}  size={5.5} op={0.28} />
      <InkBlossom cx={144} cy={2}  size={4.5} op={0.25} />
      <InkBlossom cx={98}  cy={6}  size={5}   op={0.26} />
      {/* 散る花びら */}
      <DriftPetal cx={238} cy={52} size={4}   angle={-22} op={0.15} />
      <DriftPetal cx={258} cy={38} size={3.5} angle={18}  op={0.12} />
      <DriftPetal cx={268} cy={62} size={3}   angle={-8}  op={0.1}  />
    </>
  );
}

// 夏：竹
function SummerMotif() {
  const joints = [18, 40, 62] as const;
  return (
    <>
      <path d="M 232 80 C 230 55, 234 30, 229 0" stroke="currentColor" strokeWidth={3}   strokeLinecap="round" opacity={0.13} />
      <path d="M 258 80 C 256 50, 260 25, 255 0" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.1}  />
      <path d="M 282 80 C 280 60, 284 35, 279 0" stroke="currentColor" strokeWidth={2}   strokeLinecap="round" opacity={0.08} />
      {joints.map((y) => (
        <line key={y} x1={226} y1={y} x2={236} y2={y} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.18} />
      ))}
      {/* 葉 */}
      <path d="M 230 28 C 215 18, 200 20, 195 15" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.22} />
      <path d="M 230 28 C 218 34, 207 29, 203 34" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.2}  />
      <path d="M 256 23 C 242 16, 237 18, 234 14" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.2}  />
      <path d="M 256 23 C 246 30, 240 26, 238 31" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.18} />
    </>
  );
}

// 秋：もみじ枝
function MapleLeaf({ cx, cy, size = 8, angle = 0, op = 0.22 }: Readonly<{ cx: number; cy: number; size?: number; angle?: number; op?: number }>) {
  const s = size;
  const d = [
    `M 0 0`,
    `L ${s*0.25} ${-s*0.35}`,
    `L ${s*0.08} ${-s*0.38}`,
    `L ${s*0.45} ${-s*0.9}`,
    `L ${s*0.18} ${-s*0.72}`,
    `L ${s*0.62} ${-s*0.82}`,
    `L ${s*0.28} ${-s*0.48}`,
    `L 0 ${-s*0.85}`,
    `L ${-s*0.28} ${-s*0.48}`,
    `L ${-s*0.62} ${-s*0.82}`,
    `L ${-s*0.18} ${-s*0.72}`,
    `L ${-s*0.45} ${-s*0.9}`,
    `L ${-s*0.08} ${-s*0.38}`,
    `L ${-s*0.25} ${-s*0.35}`,
    'Z',
  ].join(' ');
  return (
    <g transform={`translate(${cx},${cy}) rotate(${angle})`} opacity={op} fill="currentColor">
      <path d={d} />
    </g>
  );
}

function AutumnMotif() {
  return (
    <>
      <path d="M 280 72 C 240 56, 205 36, 175 22" stroke="currentColor" strokeWidth={2}   strokeLinecap="round" opacity={0.2}  />
      <path d="M 195 26 C 185 14, 180 7, 178 3"   stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.18} />
      <MapleLeaf cx={178} cy={3}  size={11} angle={-12} op={0.25} />
      <MapleLeaf cx={165} cy={14} size={8}  angle={16}  op={0.2}  />
      <MapleLeaf cx={240} cy={42} size={7}  angle={-22} op={0.18} />
      <MapleLeaf cx={268} cy={58} size={6}  angle={28}  op={0.14} />
      <MapleLeaf cx={255} cy={30} size={5}  angle={-8}  op={0.12} />
    </>
  );
}

// 冬：梅の枝
function WinterMotif() {
  const blossomPositions = [
    { cx: 172, cy: 5 },
    { cx: 220, cy: 10 },
    { cx: 192, cy: 20 },
  ] as const;
  const snowDots = [
    [256, 24], [272, 44], [298, 30], [308, 54], [244, 50],
  ] as const;
  return (
    <>
      <path d="M 280 72 C 245 58, 218 46, 200 38" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" opacity={0.18} />
      <path d="M 200 38 C 188 24, 180 13, 172 5"   stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity={0.22} />
      <path d="M 215 40 C 208 26, 215 16, 220 10"  stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" opacity={0.18} />
      <path d="M 200 38 C 194 30, 192 24, 192 20"  stroke="currentColor" strokeWidth={1}   strokeLinecap="round" opacity={0.16} />
      {blossomPositions.map(({ cx, cy }, i) => (
        <InkBlossom key={i} cx={cx} cy={cy} size={4.5} op={0.26 - i * 0.02} />
      ))}
      {/* 雪 */}
      {snowDots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.5} fill="currentColor" opacity={Math.max(0.06, 0.15 - i * 0.02)} />
      ))}
    </>
  );
}

export function SeasonalVignette() {
  const season = getSeason(new Date().getMonth() + 1);
  return (
    <div className={styles.mastVignette} aria-hidden="true">
      <svg
        viewBox="0 0 280 72"
        width="280"
        height="72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {season === 'spring' && <SpringMotif />}
        {season === 'summer' && <SummerMotif />}
        {season === 'autumn' && <AutumnMotif />}
        {season === 'winter' && <WinterMotif />}
      </svg>
    </div>
  );
}
