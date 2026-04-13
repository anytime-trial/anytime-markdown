'use client';

import { useCallback } from 'react';

import { C4ViewerCore, useC4DataSource } from '@anytime-markdown/trail-viewer';
import type { DocLink } from '@anytime-markdown/trail-core/c4';
import { useThemeMode } from '../../providers';

/**
 * web アプリの C4 ビュワー。
 *
 * 拡張機能と同じく trail-viewer の useC4DataSource を使用し、相対パス ('') 経由で
 * 同居する Next.js API route (/api/c4/...) を叩く。WebSocket サーバは無いため
 * 初回 fetch のみ動作する（read-only 運用）。
 */
export function C4Viewer() {
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';

  const c4 = useC4DataSource('');

  const handleDocLinkClick = useCallback((doc: DocLink) => {
    globalThis.open(`/docs/view?ghPath=${encodeURIComponent(doc.path)}`, '_blank');
  }, []);

  return (
    <C4ViewerCore
      isDark={isDark}
      c4Model={c4.c4Model}
      boundaries={c4.boundaries}
      featureMatrix={c4.featureMatrix}
      coverageMatrix={c4.coverageMatrix}
      coverageDiff={c4.coverageDiff}
      docLinks={c4.docLinks}
      onDocLinkClick={handleDocLinkClick}
      containerHeight="calc(100vh - 64px)"
      releases={c4.releases}
      selectedRelease={c4.selectedRelease}
      onReleaseSelect={c4.setSelectedRelease}
      selectedRepo={c4.selectedRepo}
      onRepoSelect={c4.setSelectedRepo}
    />
  );
}
