'use client';

import { Box, Button, ButtonGroup, Paper, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GraphInput } from '@anytime-markdown/graph';

import LandingHeader from '../components/LandingHeader';
import { useThemeMode } from '../providers';

// 添付画像（コードグラフ風）の矩形配色: 濃紺の塗り + 明るい青の枠線 + 白文字。
const NODE_STYLE = { fill: '#101A2E', stroke: '#5B9BD5', strokeWidth: 1.5, fontColor: '#FFFFFF' } as const;

/** 提案 proposal/20260522 の株価要因マインドマップをサンプルに使う。 */
const SAMPLE: GraphInput = {
  schemaVersion: '1.0',
  rootId: 'root',
  layout: 'radial',
  nodes: [
    { id: 'root', label: '7832 週次リターン -0.13%', ...NODE_STYLE },
    { id: 'market', label: '市場要因 +0.22pp', ...NODE_STYLE },
    { id: 'sector', label: '業種要因 +0.76pp', ...NODE_STYLE },
    { id: 'idio', label: '個別要因 -1.11pp', ...NODE_STYLE },
    { id: 'd0519', label: '急変日 5/19 ret +7.4% / ε +5.8%', ...NODE_STYLE },
    { id: 'd0521', label: '急変日 5/21 ret -2.9% / ε -2.7%', ...NODE_STYLE },
    { id: 'ev1', label: '決算後再評価 (5/12 過去最高益)', ...NODE_STYLE },
    { id: 'ev2', label: 'ゲーム株テーマ買い', ...NODE_STYLE },
    { id: 'ev3', label: '利確 / FY2027 減益見通し', ...NODE_STYLE },
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
  const [movable, setMovable] = useState(true);
  const [collapsible, setCollapsible] = useState(true);
  const [minimap, setMinimap] = useState(true);
  const [ready, setReady] = useState(false);

  // Custom Element を登録して生成（client 限定。HTMLElement 継承のため SSR では評価しない）
  useEffect(() => {
    let cancelled = false;
    let el: AnytimeGraphEl | null = null;
    const onNodeClick = (e: Event) => setClicked(JSON.stringify((e as CustomEvent).detail));
    void (async () => {
      await import('@anytime-markdown/graph');
      if (cancelled || !hostRef.current) return;
      el = document.createElement('anytime-graph') as AnytimeGraphEl;
      el.setAttribute('theme', themeMode);
      if (movable) el.setAttribute('movable-nodes', '');
      if (collapsible) el.setAttribute('collapsible', '');
      if (minimap) el.setAttribute('minimap', '');
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

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (movable) el.setAttribute('movable-nodes', '');
    else el.removeAttribute('movable-nodes');
  }, [movable]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (collapsible) el.setAttribute('collapsible', '');
    else el.removeAttribute('collapsible');
  }, [collapsible]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (minimap) el.setAttribute('minimap', '');
    else el.removeAttribute('minimap');
  }, [minimap]);

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
          <Button variant={movable ? 'contained' : 'outlined'} size="small" onClick={() => setMovable((v) => !v)} disabled={!ready}>
            ノード移動: {movable ? 'ON' : 'OFF'}
          </Button>
          <Button variant={collapsible ? 'contained' : 'outlined'} size="small" onClick={() => setCollapsible((v) => !v)} disabled={!ready}>
            折りたたみ: {collapsible ? 'ON' : 'OFF'}
          </Button>
          <Button variant={minimap ? 'contained' : 'outlined'} size="small" onClick={() => setMinimap((v) => !v)} disabled={!ready}>
            ミニマップ: {minimap ? 'ON' : 'OFF'}
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
