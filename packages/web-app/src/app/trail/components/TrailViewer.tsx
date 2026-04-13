'use client';

import { useCallback } from 'react';

import { TrailViewerApp } from '@anytime-markdown/trail-viewer';
import type { DocLink } from '@anytime-markdown/trail-core/c4';

import { useThemeMode } from '../../providers';
import { useLocaleSwitch } from '../../LocaleProvider';

import { TrailErrorBoundary } from './TrailErrorBoundary';

/**
 * web アプリの Trail Viewer ラッパー。
 *
 * 共通の TrailViewerApp に同居 Next.js API ルート（serverUrl=''）を渡すだけのシェル。
 * editable は false（read-only）。doc link は新規タブで開く。
 */
export function TrailViewer() {
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
        isDark={isDark}
        locale={locale}
        containerHeight="calc(100vh - 64px)"
        onDocLinkClick={handleDocLinkClick}
      />
    </TrailErrorBoundary>
  );
}
