'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Box, CircularProgress } from '@mui/material';
import { useThemeMode } from './providers';
import { useLocaleSwitch } from './LocaleProvider';
import { WebFileSystemProvider } from '../lib/WebFileSystemProvider';
import { FallbackFileSystemProvider } from '../lib/FallbackFileSystemProvider';

const MarkdownEditorPage = dynamic(
  () => import('@anytime-markdown/editor-core/src/MarkdownEditorPage'),
  {
    ssr: false,
    loading: () => (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    ),
  }
);

export default function Page() {
  const { themeMode, setThemeMode } = useThemeMode();
  const { setLocale } = useLocaleSwitch();

  const fileSystemProvider = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const web = new WebFileSystemProvider();
    return web.supportsDirectAccess ? web : new FallbackFileSystemProvider();
  }, []);

  return (
    <MarkdownEditorPage
      themeMode={themeMode}
      onThemeModeChange={setThemeMode}
      onLocaleChange={setLocale}
      fileSystemProvider={fileSystemProvider}
    />
  );
}
