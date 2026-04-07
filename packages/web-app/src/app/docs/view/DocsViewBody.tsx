'use client';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';
import { Alert, Box, Breadcrumbs, Container, Link as MuiLink, Typography } from '@mui/material';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import LandingHeader from '../../components/LandingHeader';
import MarkdownViewer from '../../components/MarkdownViewer';
import SiteFooter from '../../components/SiteFooter';
import { useLocaleSwitch } from '../../LocaleProvider';

/**
 * docKey からロケール別の docKey マップを生成。
 * - ファイルキー (xxx.ja.md / xxx.en.md): 他言語キーを生成
 * - フォルダキー (docs/folder/): 各ロケール用ファイルキーを生成
 */
function resolveDocKeys(docKey: string, locale: string): { resolved: string; fallback?: string; localeMap?: Partial<Record<string, string>> } {
  // フォルダキー（末尾スラッシュ）の場合
  if (docKey.endsWith('/')) {
    const folderName = docKey.split('/').findLast(Boolean) ?? '';
    const resolved = `${docKey}${folderName}.${locale}.md`;
    const otherLocale = locale === 'ja' ? 'en' : 'ja';
    // 言語サフィックスなしファイルをフォールバックに設定
    return { resolved, fallback: `${docKey}${folderName}.md`, localeMap: { [otherLocale]: `${docKey}${folderName}.${otherLocale}.md` } };
  }
  // 言語サフィックス付きファイルキーの場合
  const jaMatch = /^(.+)\.ja\.md$/.exec(docKey);
  if (jaMatch) return { resolved: docKey, localeMap: { en: `${jaMatch[1]}.en.md` } };
  const enMatch = /^(.+)\.en\.md$/.exec(docKey);
  if (enMatch) return { resolved: docKey, localeMap: { ja: `${enMatch[1]}.ja.md` } };
  // 言語サフィックスなしの場合
  return { resolved: docKey };
}

/** docKey からユーザー向けの表示名を導出する */
function deriveDisplayName(docKey: string): string {
  if (docKey.endsWith('/')) {
    return docKey.split('/').findLast(Boolean) ?? docKey;
  }
  const name = docKey.split('/').pop() ?? docKey;
  return name.replace(/\.(ja|en)\.md$/, '').replace(/\.md$/, '');
}

export default function DocsViewBody({ docTitle }: Readonly<{ docTitle?: string }>) {
  const searchParams = useSearchParams();
  const key = searchParams.get('key');
  const ghPath = searchParams.get('ghPath');
  const t = useTranslations('Landing');
  const { locale } = useLocaleSwitch();

  // GitHub パス指定の場合はロケール解決をスキップ
  const isGitHub = !!ghPath;
  const { resolved, fallback, localeMap } = key ? resolveDocKeys(key, locale) : { resolved: ghPath ?? '', fallback: undefined, localeMap: undefined };
  const displayName = docTitle ?? (key ? deriveDisplayName(key) : ghPath ? deriveDisplayName(ghPath) : '');

  if (!key && !ghPath) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LandingHeader />
        <Container maxWidth="md" sx={{ flex: 1, py: 6 }}>
          <MuiLink
            component={NextLink}
            href="/docs"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              mb: 3,
              textDecoration: 'none',
              color: 'text.secondary',
              '&:hover': { color: 'primary.main' },
            }}
          >
            <FolderIcon sx={{ fontSize: 18 }} />
            {t('docsPage')}
          </MuiLink>
          <Alert severity="error">{t('docsViewNoUrl')}</Alert>
        </Container>
        <SiteFooter />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <LandingHeader />
      <Box
        component="nav"
        aria-label={t('ariaBreadcrumb')}
        sx={{
          px: 2,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        }}
      >
        <Breadcrumbs
          separator={<ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
          sx={{ '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' } }}
        >
          <MuiLink
            component={NextLink}
            href="/docs"
            underline="hover"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              fontSize: '0.8rem',
              color: 'text.secondary',
              transition: 'color 0.15s',
              '&:hover': { color: 'primary.main' },
            }}
          >
            <FolderIcon sx={{ fontSize: 15 }} />
            {t('docsPage')}
          </MuiLink>
          <Typography
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              fontSize: '0.8rem',
              color: 'text.primary',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: { xs: 200, sm: 400, md: 'none' },
            }}
          >
            <DescriptionIcon sx={{ fontSize: 15, flexShrink: 0, opacity: 0.7 }} />
            {displayName}
          </Typography>
        </Breadcrumbs>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', '& #main-content': { px: { xs: 0, md: 3 } } }}>
        <MarkdownViewer
          docKey={resolved}
          docKeyByLocale={isGitHub ? undefined : localeMap}
          fallbackDocKey={isGitHub ? undefined : fallback}
          contentApiPath={isGitHub ? '/api/docs/github-content' : '/api/docs/content'}
          minHeight="calc(100vh - 64px - 41px)"
        />
      </Box>
    </Box>
  );
}
