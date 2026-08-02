import { Box, Container, Typography } from '@mui/material';
import type { Metadata } from 'next';

import { buildSingleSourceAlternates } from '../../../lib/localeAlternates';
import LandingHeader from '../components/LandingHeader';
import { SpotifyPageContent } from './SpotifyPageContent';

const METADATA_BASE: Metadata = {
  title: 'Spotify プレイリスト',
  description:
    '話題の曲を選んで、あなたの Spotify にプレイリストを作成します。| Create a Spotify playlist from trending tracks.',
};

export default function SpotifyPage() {
  return (
    <>
      <LandingHeader />
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box component="header" sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Spotify プレイリスト作成
          </Typography>
          <Typography variant="body2" color="text.secondary">
            話題の曲を選んで、あなたの Spotify にプレイリストを作成します。
          </Typography>
        </Box>
        <SpotifyPageContent />
      </Container>
    </>
  );
}

// 本文が日本語のみ（i18n メッセージを使っていない）ため、en 版があるとは申告しない。
// 翻訳を入れる際は buildAlternates へ戻し、metadata も getTranslations 経由にする。
export function generateMetadata(): Metadata {
  return { ...METADATA_BASE, alternates: buildSingleSourceAlternates('/spotify') };
}
