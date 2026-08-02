import { Box, Container, Typography } from '@mui/material';
import type { Metadata } from 'next';

import { buildSingleSourceAlternates } from '../../../lib/localeAlternates';
import LandingHeader from '../components/LandingHeader';
import { PlaylistPageContent } from './PlaylistPageContent';

const METADATA_BASE: Metadata = {
  title: 'プレイリスト作成',
  description:
    'Spotify・YouTube の話題のコンテンツを選んで、プレイリストを作成します。| Build a playlist from trending Spotify and YouTube content.',
};

export default function PlaylistPage() {
  return (
    <>
      <LandingHeader />
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box component="header" sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            プレイリスト作成
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Spotify・YouTube の話題のコンテンツを選んで、プレイリストを作成します。
          </Typography>
        </Box>
        <PlaylistPageContent />
      </Container>
    </>
  );
}

// 本文が日本語のみ（i18n メッセージを使っていない）ため、en 版があるとは申告しない。
// 翻訳を入れる際は buildAlternates へ戻し、metadata も getTranslations 経由にする。
export function generateMetadata(): Metadata {
  return { ...METADATA_BASE, alternates: buildSingleSourceAlternates('/playlist') };
}
