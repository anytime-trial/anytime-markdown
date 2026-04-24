'use client';

import type { DocLink } from '@anytime-markdown/trail-core/c4';
import { TrailViewerApp } from '@anytime-markdown/trail-viewer';
import { useCallback } from 'react';

import { useLocaleSwitch } from '../../LocaleProvider';
import { useThemeMode } from '../../providers';
import { TrailErrorBoundary } from './TrailErrorBoundary';

/**
 * web アプリの Trail Viewer ラッパー。
 *
 * 共通の TrailViewerApp に同居 Next.js API ルート（serverUrl=''）を渡すだけのシェル。
 * editable は true（グループ機能などの編集操作を有効化）。doc link は新規タブで開く。
 */
export function TrailViewer({ containerHeight = 'calc(100vh - 64px)' }: Readonly<{ containerHeight?: string }> = {}) {
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const { locale } = useLocaleSwitch();

  const handleDocLinkClick = useCallback((doc: DocLink) => {
    globalThis.open(`/docs/view?ghPath=${encodeURIComponent(doc.path)}`, '_blank');
  }, []);

  return (
    <TrailErrorBoundary>
      <TrailViewerApp
        serverUrl=""
        editable
        isDark={isDark}
        locale={locale}
        containerHeight={containerHeight}
        onDocLinkClick={handleDocLinkClick}
      />
    </TrailErrorBoundary>
  );
}
