'use client';

import { useEffect, useState } from 'react';

import styles from '../press.module.css';

type Season = 'spring' | 'summer' | 'autumn' | 'winter';

function getSeason(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** 日付シードから決定論的な 0..1 の値を返す */
function drand(seed: number, i: number): number {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 年 × 1000 + 年内通算日 をシードとする（毎日変化、翌年は別値） */
function getDaySeed(): number {
  const d = new Date();
  const doy = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return d.getFullYear() * 1000 + doy;
}

// ─── 部品 ────────────────────────────────────────────────

function InkPetal({ size = 5 }: Readonly<{ size?: number }>) {
  const s = size;
  return (
    <path d={`M 0 0 Q ${-s * 0.45} ${-s * 0.6} 0 ${-s} Q ${s * 0.45} ${-s * 0.6} 0 0`} fill="currentColor" />
  );
}

function InkBlossom({ cx, cy, size = 5, op = 0.28 }: Readonly<{ cx: number; cy: number; size?: number; op?: number }>) {
  return (
    <g transform={`translate(${cx},${cy})`} opacity={op} fill="currentColor">
      {([0, 72, 144, 216, 288] as const).map((a) => (
        <g key={a} transform={`rotate(${a})`}><InkPetal size={size} /></g>
      ))}
      <circle r={size * 0.22} opacity={0.7} />
    </g>
  );
}

// ─── 春：桜 ──────────────────────────────────────────────

function SpringMotif({ day }: Readonly<{ day: number }>) {
  const r = (i: number) => drand(day, i);

  // 主幹の終点を毎日わずかに変える
  const ex = 90 + (r(0) - 0.5) * 28;
  const ey = 4 + r(1) * 5;

  // 花の数: 2〜4
  const blossomCount = 2 + Math.floor(r(2) * 3);
  const blossoms = [
    { cx: 200 + (r(3) - 0.5) * 10, cy: 6 + r(4) * 3,  size: 4.5 + r(5) * 2 },
    { cx: 145 + (r(6) - 0.5) * 10, cy: 2 + r(7) * 3,  size: 3.5 + r(8) * 2 },
    { cx: ex,                        cy: ey,             size: 4   + r(9) * 1.5 },
    { cx: 172 + (r(10) - 0.5) * 8,  cy: 14 + r(11) * 4, size: 3  + r(12) * 1.5 },
  ].slice(0, blossomCount);

  // 散る花びら: 1〜4
  const petalCount = 1 + Math.floor(r(13) * 4);
  const petals = Array.from({ length: petalCount }, (_, k) => ({
    cx:    215 + r(14 + k * 4) * 60,
    cy:    28  + r(15 + k * 4) * 40,
    size:  3   + r(16 + k * 4) * 2,
    angle: (r(17 + k * 4) - 0.5) * 70,
    op:    0.08 + r(18 + k * 4) * 0.1,
  }));

  // 小雨（穀雨っぽい日: 約40%の確率）
  const showRain = r(50) > 0.58;
  const rainLines = showRain
    ? Array.from({ length: 5 + Math.floor(r(51) * 5) }, (_, k) => ({
        x: 190 + r(52 + k * 2) * 90,
        y: r(53 + k * 2) * 60,
        len: 6 + r(54 + k) * 8,
        op: 0.06 + r(55 + k) * 0.07,
      }))
    : [];

  return (
    <>
      {/* 主幹 — 墨の滲み */}
      <path d={`M 280 70 C 235 56, 190 38, 158 24 C 135 15, 118 10, ${ex} ${ey}`}
        stroke="currentColor" strokeWidth={9} strokeLinecap="round" opacity={0.05} />
      {/* 主幹 — 線 */}
      <path d={`M 280 70 C 235 56, 190 38, 158 24 C 135 15, 118 10, ${ex} ${ey}`}
        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.22} />
      {/* 枝1 */}
      <path d={`M 178 ${28 + (r(60) - 0.5) * 4} C 186 17, 194 10, 200 6`}
        stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" opacity={0.2} />
      {/* 枝2 */}
      <path d={`M 148 ${23 + (r(61) - 0.5) * 4} C 142 14, 140 6, 144 2`}
        stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" opacity={0.18} />
      {blossoms.map((b, i) => (
        <InkBlossom key={`blossom-${b.cx}-${b.cy}`} cx={b.cx} cy={b.cy} size={b.size} op={0.22 + r(70 + i) * 0.1} />
      ))}
      {petals.map((p) => (
        <g key={`petal-${p.cx}-${p.cy}-${p.angle}`} transform={`translate(${p.cx},${p.cy}) rotate(${p.angle})`} opacity={p.op} fill="currentColor">
          <InkPetal size={p.size} />
        </g>
      ))}
      {rainLines.map((l) => (
        <line key={`rain-${l.x}-${l.y}-${l.len}`} x1={l.x} y1={l.y} x2={l.x - 2} y2={l.y + l.len}
          stroke="currentColor" strokeWidth={0.6} strokeLinecap="round" opacity={l.op} />
      ))}
    </>
  );
}

// ─── 夏：竹 ──────────────────────────────────────────────

function SummerMotif({ day }: Readonly<{ day: number }>) {
  const r = (i: number) => drand(day, i);

  // 幹の本数・位置を毎日変える（2〜4本）
  const stalkCount = 2 + Math.floor(r(0) * 3);
  const stalks = Array.from({ length: stalkCount }, (_, k) => ({
    x:   225 + k * (20 + r(1 + k) * 10),
    w:   3.5 - k * 0.5,
    op:  0.14 - k * 0.02,
  }));

  // 葉の枚数: 2〜5
  const leafCount = 2 + Math.floor(r(10) * 4);
  const leaves = Array.from({ length: leafCount }, (_, k) => ({
    x1: stalks[k % stalkCount]?.x ?? 230,
    y1: 18 + r(11 + k) * 30,
    dx: (r(12 + k) - 0.5) > 0 ? 1 : -1,
    len: 18 + r(13 + k) * 15,
    op: 0.18 + r(14 + k) * 0.07,
  }));

  // 螢（ほたる）: 20%の確率
  const showFireflies = r(50) > 0.8;
  const fireflies = showFireflies
    ? Array.from({ length: 3 + Math.floor(r(51) * 3) }, (_, k) => ({
        cx: 215 + r(52 + k * 2) * 60,
        cy: 15  + r(53 + k * 2) * 50,
        op: 0.12 + r(54 + k) * 0.1,
      }))
    : [];

  return (
    <>
      {stalks.map((s) => (
        <path key={`stalk-${s.x}`}
          d={`M ${s.x} 80 C ${s.x - 2} 55, ${s.x + 2} 30, ${s.x - 2} 0`}
          stroke="currentColor" strokeWidth={s.w} strokeLinecap="round" opacity={s.op} />
      ))}
      {stalks.map((s) =>
        ([18, 40, 62] as const).map((y) => (
          <line key={`${s.x}-${y}`} x1={s.x - 5} y1={y} x2={s.x + 5} y2={y}
            stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity={0.18} />
        ))
      )}
      {leaves.map((l, i) => {
        const ex = l.x1 + l.dx * l.len;
        const ey = l.y1 - 8 + r(15 + i) * 6;
        return (
          <path key={`leaf-${l.x1}-${l.y1}-${l.dx}-${l.len}`}
            d={`M ${l.x1} ${l.y1} C ${l.x1 + l.dx * l.len * 0.5} ${l.y1 - 12} ${ex} ${ey} ${ex} ${ey}`}
            stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" opacity={l.op} />
        );
      })}
      {fireflies.map((f) => (
        <circle key={`firefly-${f.cx}-${f.cy}`} cx={f.cx} cy={f.cy} r={1.2} fill="currentColor" opacity={f.op} />
      ))}
    </>
  );
}

// ─── 秋：もみじ ───────────────────────────────────────────

function MapleLeaf({ cx, cy, size = 8, angle = 0, op = 0.22 }: Readonly<{ cx: number; cy: number; size?: number; angle?: number; op?: number }>) {
  const s = size;
  const d = [
    `M 0 0`,
    `L ${s*.25} ${-s*.35}`, `L ${s*.08} ${-s*.38}`,
    `L ${s*.45} ${-s*.9}`,  `L ${s*.18} ${-s*.72}`,
    `L ${s*.62} ${-s*.82}`, `L ${s*.28} ${-s*.48}`,
    `L 0 ${-s*.85}`,
    `L ${-s*.28} ${-s*.48}`, `L ${-s*.62} ${-s*.82}`,
    `L ${-s*.18} ${-s*.72}`, `L ${-s*.45} ${-s*.9}`,
    `L ${-s*.08} ${-s*.38}`, `L ${-s*.25} ${-s*.35}`, 'Z',
  ].join(' ');
  return (
    <g transform={`translate(${cx},${cy}) rotate(${angle})`} opacity={op} fill="currentColor">
      <path d={d} />
    </g>
  );
}

function AutumnMotif({ day }: Readonly<{ day: number }>) {
  const r = (i: number) => drand(day, i);

  const leafCount = 2 + Math.floor(r(0) * 4);
  const leaves = Array.from({ length: leafCount }, (_, k) => ({
    cx:    165 + r(1 + k * 3) * 110,
    cy:    4   + r(2 + k * 3) * 60,
    size:  6   + r(3 + k * 3) * 6,
    angle: (r(4 + k) - 0.5) * 60,
    op:    0.18 + r(5 + k) * 0.1,
  }));

  // 名月（秋分前後 約30%）
  const showMoon = r(50) > 0.7;

  return (
    <>
      <path d="M 280 72 C 240 56, 205 36, 175 22"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.2} />
      <path d={`M 195 ${26 + (r(60) - 0.5) * 4} C 185 14, 180 7, 178 3`}
        stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.18} />
      {leaves.map((l) => (
        <MapleLeaf key={`maple-${l.cx}-${l.cy}-${l.angle}`} cx={l.cx} cy={l.cy} size={l.size} angle={l.angle} op={l.op} />
      ))}
      {showMoon && (
        <circle cx={255 + r(51) * 20} cy={12 + r(52) * 15} r={9 + r(53) * 4}
          stroke="currentColor" strokeWidth={0.8} opacity={0.14} />
      )}
    </>
  );
}

// ─── 冬：梅 ──────────────────────────────────────────────

function WinterMotif({ day }: Readonly<{ day: number }>) {
  const r = (i: number) => drand(day, i);

  const blossomCount = 2 + Math.floor(r(0) * 3);
  const blossoms = [
    { cx: 172 + (r(1) - 0.5) * 10, cy: 5  + r(2) * 4 },
    { cx: 220 + (r(3) - 0.5) * 8,  cy: 10 + r(4) * 3 },
    { cx: 192 + (r(5) - 0.5) * 8,  cy: 20 + r(6) * 4 },
    { cx: 205 + (r(7) - 0.5) * 10, cy: 34 + r(8) * 4 },
  ].slice(0, blossomCount);

  const snowCount = 3 + Math.floor(r(20) * 8);
  const snow = Array.from({ length: snowCount }, (_, k) => ({
    cx: 200 + r(21 + k * 2) * 80,
    cy: r(22 + k * 2) * 72,
    r:  0.8 + r(23 + k) * 1.2,
    op: 0.08 + r(24 + k) * 0.1,
  }));

  return (
    <>
      <path d="M 280 72 C 245 58, 218 46, 200 38"
        stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" opacity={0.18} />
      <path d="M 200 38 C 188 24, 180 13, 172 5"
        stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity={0.22} />
      <path d="M 215 40 C 208 26, 215 16, 220 10"
        stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" opacity={0.18} />
      <path d="M 200 38 C 194 30, 192 24, 192 20"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.16} />
      {blossoms.map(({ cx, cy }, i) => (
        <InkBlossom key={`winter-blossom-${cx}-${cy}`} cx={cx} cy={cy} size={4 + r(30 + i) * 1.5} op={0.24 - i * 0.02} />
      ))}
      {snow.map((s) => (
        <circle key={`snow-${s.cx}-${s.cy}-${s.r}`} cx={s.cx} cy={s.cy} r={s.r} fill="currentColor" opacity={s.op} />
      ))}
    </>
  );
}

// ─── メインコンポーネント ─────────────────────────────────

type MotifState = { season: Season; day: number } | null;

export function SeasonalVignette() {
  const [motif, setMotif] = useState<MotifState>(null);

  useEffect(() => {
    const today = new Date();
    setMotif({ season: getSeason(today.getMonth() + 1), day: getDaySeed() });
  }, []);

  if (!motif) {
    return <div className={styles.mastVignette} aria-hidden="true" />;
  }

  const { season, day } = motif;

  return (
    <div className={styles.mastVignette} aria-hidden="true">
      <svg viewBox="0 0 280 72" width="280" height="72" fill="none" xmlns="http://www.w3.org/2000/svg">
        {season === 'spring' && <SpringMotif  day={day} />}
        {season === 'summer' && <SummerMotif  day={day} />}
        {season === 'autumn' && <AutumnMotif  day={day} />}
        {season === 'winter' && <WinterMotif  day={day} />}
      </svg>
    </div>
  );
}
