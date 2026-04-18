import { Box, Container, Typography } from '@mui/material';
import LandingHeader from '../components/LandingHeader';
import { SpotifyPageContent } from './SpotifyPageContent';

export const metadata = { title: 'Spotify プレイリスト | anytime-markdown' };

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
