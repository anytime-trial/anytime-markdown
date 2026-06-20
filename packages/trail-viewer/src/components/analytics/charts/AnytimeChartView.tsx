import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';

import type { ChartSpec } from '@anytime-markdown/chart-core';

import { useTrailTheme } from '../../TrailThemeContext';

/** `<anytime-chart>` Custom Element の型（spec は property 経由）。 */
interface AnytimeChartElement extends HTMLElement {
  spec: ChartSpec;
}

/**
 * chart-core の `<anytime-chart>` Web Component を React 内に薄く包む。
 * 副作用 import で customElements.define を発火させ、ref 経由で `.spec` を流し、
 * テーマ（dark/light）は属性で同期する。枠（Paper 等）は呼び出し側が持つ。
 */
export function AnytimeChartView({
  spec,
  height = 300,
  palette,
  onCategoryClick,
  isDark: isDarkProp,
}: Readonly<{
  spec: ChartSpec;
  height?: number;
  palette?: string;
  /** カテゴリ（分類軸バンド）クリック時に dataIndex を返す（日付ドリルダウン等）。 */
  onCategoryClick?: (dataIndex: number) => void;
  /** TrailThemeProvider 外で使う場合の明示テーマ（省略時は Context の isDark）。 */
  isDark?: boolean;
}>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<AnytimeChartElement | null>(null);
  const clickRef = useRef(onCategoryClick);
  clickRef.current = onCategoryClick;
  const ctxDark = useTrailTheme().isDark;
  const isDark = isDarkProp ?? ctxDark;

  useEffect(() => {
    let cancelled = false;
    let el: AnytimeChartElement | null = null;
    const onClick = (e: Event) => {
      const idx = (e as CustomEvent<{ dataIndex: number }>).detail?.dataIndex;
      if (typeof idx === 'number') clickRef.current?.(idx);
    };
    void (async () => {
      await import('@anytime-markdown/chart-core/element');
      if (cancelled || !hostRef.current) return;
      el = document.createElement('anytime-chart') as AnytimeChartElement;
      el.setAttribute('theme', isDark ? 'dark' : 'light');
      if (palette) el.setAttribute('palette', palette);
      el.style.width = '100%';
      el.style.height = '100%';
      el.addEventListener('category-click', onClick);
      hostRef.current.append(el);
      el.spec = spec;
      elRef.current = el;
    })();
    return () => {
      cancelled = true;
      el?.removeEventListener('category-click', onClick);
      el?.remove();
      elRef.current = null;
    };
    // マウント時のみ生成。spec/theme/palette の更新は下の effect で反映する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    elRef.current?.setAttribute('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (palette) elRef.current?.setAttribute('palette', palette);
  }, [palette]);

  useEffect(() => {
    if (elRef.current) elRef.current.spec = spec;
  }, [spec]);

  return <Box ref={hostRef} sx={{ width: '100%', height }} />;
}
