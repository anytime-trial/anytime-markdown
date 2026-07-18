'use client';

import { createMarkdownT } from '@anytime-markdown/markdown-viewer/src/i18n/createMarkdownT';
import { TicketsPanel, type TicketsClientConfig } from '@anytime-markdown/tickets-viewer';
import { Box, Container, Typography } from '@mui/material';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';
import { EmbedProvidersBoundary } from '../providers/EmbedProvidersBoundary';
import TicketsRepoDialog, { type TicketsRepoSelection } from './TicketsRepoDialog';

// read-only・chromeless の Web Component 表示（ブラウザ専用のため ssr:false）
const VanillaMarkdownView = dynamic(() => import('../components/VanillaMarkdownView'), { ssr: false });

const STORAGE_KEY = 'ticketsRepoSelection';

// 視覚的に隠しつつ支援技術には読ませる（display:none / visibility:hidden はどちらも読み上げ対象外になる）
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function loadSelection(): TicketsRepoSelection | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<TicketsRepoSelection>;
    if (typeof parsed.repo === 'string' && typeof parsed.branch === 'string') {
      return { repo: parsed.repo, branch: parsed.branch };
    }
  } catch (error) {
    console.warn(`[${new Date().toISOString()}] [WARN] tickets: 保存済みリポジトリ選択の解析に失敗`, error);
  }
  return null;
}

export default function TicketsBody() {
  const t = useTranslations('tickets');
  const { data: session } = useSession();
  const { locale } = useLocaleSwitch();
  const { themeMode } = useThemeMode();
  const [selection, setSelection] = useState<TicketsRepoSelection | null>(null);
  const [restored, setRestored] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const vanillaT = useMemo(() => createMarkdownT('MarkdownEditor', locale), [locale]);

  useEffect(() => {
    setSelection(loadSelection());
    setRestored(true);
  }, []);

  const config: TicketsClientConfig | null = useMemo(
    () => (selection ? { repo: selection.repo, branch: selection.branch } : null),
    [selection],
  );

  const handleSelect = (next: TicketsRepoSelection) => {
    setSelection(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const renderBody = (markdown: string): ReactNode => (
    <EmbedProvidersBoundary>
      <VanillaMarkdownView
        t={vanillaT}
        locale={locale}
        initialContent={markdown}
        readOnly
        hideStatusBar
        noScroll
        themeMode={themeMode}
      />
    </EmbedProvidersBoundary>
  );

  return (
    <>
      <LandingHeader />
      <Container maxWidth="lg" component="main" id="main-content" sx={{ py: { xs: 2, md: 3 } }}>
        {/* 見出しは LandingHeader へ寄せたが、ページの h1 は支援技術向けに残す（見た目には出さない） */}
        <Typography variant="h4" component="h1" sx={VISUALLY_HIDDEN}>
          Tickets
        </Typography>
        {restored && (
          <Box>
            <TicketsPanel
              config={config}
              currentUser={session?.user?.name ?? undefined}
              onRequestRepoSelect={() => setDialogOpen(true)}
              renderBody={renderBody}
            />
          </Box>
        )}
        {!restored && <Typography color="text.secondary">{t('common.loading')}</Typography>}
        <TicketsRepoDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSelect={handleSelect} />
      </Container>
    </>
  );
}
