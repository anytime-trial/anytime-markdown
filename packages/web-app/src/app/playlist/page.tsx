import { Box, Container, Typography } from '@mui/material';
import type { Metadata } from 'next';

import LandingHeader from '../components/LandingHeader';
import { PlaylistPageContent } from './PlaylistPageContent';

export const metadata: Metadata = {
  title: 'プレイリスト作成',
  description:
    'Spotify・YouTube の話題のコンテンツを選んで、プレイリストを作成します。| Build a playlist from trending Spotify and YouTube content.',
  alternates: { canonical: '/playlist' },
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
