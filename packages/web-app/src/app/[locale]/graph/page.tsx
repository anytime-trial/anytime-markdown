'use client';

import { useEffect, useRef } from 'react';

import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';
import type { GraphEditorHandle } from '@anytime-markdown/graph-viewer';

/**
 * graph ページ。エディタ本体は vanilla（mountVanillaGraphEditor）を ref コンテナへ
 * mount する（脱React: 旧 `next/dynamic(<GraphEditor>)` の置換）。SSR を避けるため
 * graph-viewer は useEffect 内で動的 import する。
 */
export default function GraphPage() {
  const { themeMode, setThemeMode } = useThemeMode();
  const { locale, setLocale } = useLocaleSwitch();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GraphEditorHandle | null>(null);

  // mount は一度だけ。SSR 回避のため動的 import。
  useEffect(() => {
    let disposed = false;
    void import('@anytime-markdown/graph-viewer').then(({ mountVanillaGraphEditor }) => {
      const container = containerRef.current;
      if (!container || disposed) return;
      handleRef.current = mountVanillaGraphEditor(container, {
        containerHeight: 'calc(100vh - 64px)',
        themeMode,
        onThemeModeChange: setThemeMode,
        locale,
        onLocaleChange: setLocale,
      });
    });
    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // themeMode / locale の live 反映。
  useEffect(() => {
    handleRef.current?.update({ themeMode, locale });
  }, [themeMode, locale]);

  return (
    <>
      <LandingHeader />
      <div ref={containerRef} style={{ height: 'calc(100vh - 64px)' }} />
    </>
  );
}
