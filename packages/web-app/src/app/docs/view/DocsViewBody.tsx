'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Alert, Box, Container, Link as MuiLink } from '@mui/material';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useLocaleSwitch } from '../../LocaleProvider';
import LandingHeader from '../../components/LandingHeader';
import MarkdownViewer from '../../components/MarkdownViewer';
import SiteFooter from '../../components/SiteFooter';

/**
 * docKey からロケール別の docKey マップを生成。
 * - ファイルキー (xxx.ja.md / xxx.en.md): 他言語キーを生成
 * - フォルダキー (docs/folder/): 各ロケール用ファイルキーを生成
 */
function resolveDocKeys(docKey: string, locale: string): { resolved: string; localeMap?: Partial<Record<string, string>> } {
  // フォルダキー（末尾スラッシュ）の場合
  if (docKey.endsWith('/')) {
    const folderName = docKey.split('/').filter(Boolean).at(-1) ?? '';
    const resolved = `${docKey}${folderName}.${locale}.md`;
    const otherLocale = locale === 'ja' ? 'en' : 'ja';
    return { resolved, localeMap: { [otherLocale]: `${docKey}${folderName}.${otherLocale}.md` } };
  }
  // 言語サフィックス付きファイルキーの場合
  const jaMatch = /^(.+)\.ja\.md$/.exec(docKey);
  if (jaMatch) return { resolved: docKey, localeMap: { en: `${jaMatch[1]}.en.md` } };
  const enMatch = /^(.+)\.en\.md$/.exec(docKey);
  if (enMatch) return { resolved: docKey, localeMap: { ja: `${enMatch[1]}.ja.md` } };
  // 言語サフィックスなしの場合
  return { resolved: docKey };
}

export default function DocsViewBody() {
  const searchParams = useSearchParams();
  const key = searchParams.get('key');
  const t = useTranslations('Landing');
  const { locale } = useLocaleSwitch();

  const { resolved, localeMap } = key ? resolveDocKeys(key, locale) : { resolved: '', localeMap: undefined };

  if (!key) {
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
            <ArrowBackIcon sx={{ fontSize: 18 }} />
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
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <MarkdownViewer docKey={resolved} docKeyByLocale={localeMap} minHeight="calc(100vh - 64px)" />
      </Box>
    </Box>
  );
}
