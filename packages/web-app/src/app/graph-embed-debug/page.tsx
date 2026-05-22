'use client';

import { Box, Button, ButtonGroup, Paper, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GraphInput } from '@anytime-markdown/graph-embed';

import LandingHeader from '../components/LandingHeader';
import { useThemeMode } from '../providers';

/** 提案 proposal/20260522 の株価要因マインドマップをサンプルに使う（R9 符号別配色付き）。 */
const SAMPLE: GraphInput = {
  schemaVersion: '1.0',
  rootId: 'root',
  layout: 'radial',
  nodes: [
    { id: 'root', label: '7832 週次リターン -0.13%', fill: '#6B2A20' },
    { id: 'market', label: '市場要因 +0.22pp', fill: '#4B5A3E' },
    { id: 'sector', label: '業種要因 +0.76pp', fill: '#4B5A3E' },
    { id: 'idio', label: '個別要因 -1.11pp', fill: '#6B2A20' },
    { id: 'd0519', label: '急変日 5/19 ret +7.4% / ε +5.8%', fill: '#4B5A3E' },
    { id: 'd0521', label: '急変日 5/21 ret -2.9% / ε -2.7%', fill: '#6B2A20' },
    { id: 'ev1', type: 'doc', label: '決算後再評価 (5/12 過去最高益)' },
    { id: 'ev2', type: 'doc', label: 'ゲーム株テーマ買い' },
    { id: 'ev3', type: 'doc', label: '利確 / FY2027 減益見通し' },
  ],
  edges: [
    { from: 'root', to: 'market' },
    { from: 'root', to: 'sector' },
    { from: 'root', to: 'idio' },
    { from: 'idio', to: 'd0519' },
    { from: 'idio', to: 'd0521' },
    { from: 'd0519', to: 'ev1' },
    { from: 'd0519', to: 'ev2' },
    { from: 'd0521', to: 'ev3' },
  ],
};

type LayoutMode = NonNullable<GraphInput['layout']>;

interface AnytimeGraphEl extends HTMLElement {
  data?: GraphInput;
  fitToContent?: () => void;
  toPng?: (scale?: number) => Promise<Blob>;
}

export default function GraphEmbedDebugPage() {
  const { themeMode } = useThemeMode();
  const hostRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<AnytimeGraphEl | null>(null);
  const [clicked, setClicked] = useState('—');
  const [layout, setLayout] = useState<LayoutMode>('radial');
  const [ready, setReady] = useState(false);

  // Custom Element を登録して生成（client 限定。HTMLElement 継承のため SSR では評価しない）
  useEffect(() => {
    let cancelled = false;
    let el: AnytimeGraphEl | null = null;
    const onNodeClick = (e: Event) => setClicked(JSON.stringify((e as CustomEvent).detail));
    void (async () => {
      await import('@anytime-markdown/graph-embed');
      if (cancelled || !hostRef.current) return;
      el = document.createElement('anytime-graph') as AnytimeGraphEl;
      el.setAttribute('theme', themeMode);
      el.style.width = '100%';
      el.style.height = '100%';
      el.addEventListener('node-click', onNodeClick);
      hostRef.current.append(el);
      el.data = { ...SAMPLE, layout };
      elRef.current = el;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      el?.removeEventListener('node-click', onNodeClick);
      el?.remove();
      elRef.current = null;
    };
    // マウント時に一度だけ生成する（theme/layout は別 effect で反映）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    elRef.current?.setAttribute('theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (elRef.current) elRef.current.data = { ...SAMPLE, layout };
  }, [layout]);

  const handleFit = useCallback(() => elRef.current?.fitToContent?.(), []);

  const handlePng = useCallback(async () => {
    const blob = await elRef.current?.toPng?.(2);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anytime-graph.png';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const layouts: LayoutMode[] = ['radial', 'tree-lr', 'tree-tb'];

  return (
    <>
      <LandingHeader />
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h5" gutterBottom>
          graph-embed デバッグ（{'<anytime-graph>'} Web Component）
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          実際の Custom Element をライブソースで描画する確認用ページ。テーマはアプリの切替に追従。
        </Typography>

        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ my: 2 }}>
          <ButtonGroup variant="outlined" size="small" disabled={!ready}>
            {layouts.map((mode) => (
              <Button key={mode} variant={layout === mode ? 'contained' : 'outlined'} onClick={() => setLayout(mode)}>
                {mode}
              </Button>
            ))}
          </ButtonGroup>
          <Button variant="outlined" size="small" onClick={handleFit} disabled={!ready}>
            Fit
          </Button>
          <Button variant="outlined" size="small" onClick={handlePng} disabled={!ready}>
            PNG エクスポート
          </Button>
          <Typography variant="body2" color="text.secondary">
            node-click: <code>{clicked}</code>
          </Typography>
        </Stack>

        <Paper variant="outlined" sx={{ height: 'calc(100vh - 260px)', minHeight: 360, overflow: 'hidden' }}>
          <Box ref={hostRef} sx={{ width: '100%', height: '100%' }} />
        </Paper>
      </Box>
    </>
  );
}
