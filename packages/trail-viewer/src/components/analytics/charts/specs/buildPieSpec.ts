import type { ChartSpec } from '@anytime-markdown/chart-core';

/** 円/ドーナツの 1 スライス（色は chart-core 自動パレットに委譲するため持たない）。 */
export interface PieDatum {
  readonly label: string;
  readonly value: number;
}

/**
 * ラベル+値の配列をドーナツ ChartSpec に変換する純粋関数。
 * 色は chart-core のテーマパレット自動採番に任せる（per-slice 色は指定しない）。
 * compact=true（既定）はスライス外周ラベルを抑制（色＋中央総量＋hover で識別）。
 * compact=false でスライスに「分類名 N%」を表示する。
 */
export function buildPieSpec(
  data: ReadonlyArray<PieDatum>,
  title?: string,
  opts?: Readonly<{ compact?: boolean }>,
): ChartSpec {
  const compact = opts?.compact ?? true;
  return {
    kind: 'pie',
    title,
    categories: data.map((d) => d.label),
    series: [{ name: title ?? '', values: data.map((d) => d.value) }],
    options: compact ? { donut: true, legend: 'none' } : { donut: true },
  };
}
