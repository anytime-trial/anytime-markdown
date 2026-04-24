'use client';

import { Alert, Box, CircularProgress, Grid, Snackbar, Typography } from '@mui/material';
import { signIn } from 'next-auth/react';
import { useCallback,useEffect, useState } from 'react';

import type { SpotifyTrack } from '../../lib/spotify';
import { generatePlaylistName } from '../../lib/spotify';
import type { YouTubeVideo } from '../../lib/youtube';
import { generateYouTubePlaylistName } from '../../lib/youtube';
import { CategoryTabs, type SpotifyCategory } from './components/CategoryTabs';
import { CreatePlaylistDialog } from './components/CreatePlaylistDialog';
import { type Platform,PlatformTabs } from './components/PlatformTabs';
import { PlaylistFooter } from './components/PlaylistFooter';
import { TrackCard } from './components/TrackCard';
import { YouTubeVideoCard } from './components/YouTubeVideoCard';

interface ChartsResponse { tracks: SpotifyTrack[] }
interface NewReleasesResponse {
  albums: {
    id: string;
    name: string;
    uri: string;
    artists: { name: string }[];
    images: { url: string; width: number; height: number }[];
  }[];
}
interface YouTubeTrendingResponse { videos: YouTubeVideo[] }

export function PlaylistPageContent() {
  const [platform, setPlatform] = useState<Platform>('spotify');
  const [spotifyCategory, setSpotifyCategory] = useState<SpotifyCategory>('charts');
  const [spotifyTracks, setSpotifyTracks] = useState<SpotifyTrack[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [selectedSpotify, setSelectedSpotify] = useState<Set<string>>(new Set());
  const [selectedYoutube, setSelectedYoutube] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const fetchSpotify = useCallback(async (cat: SpotifyCategory) => {
    setLoading(true);
    try {
      const endpoint = cat === 'charts' ? '/api/spotify/charts' : '/api/spotify/new-releases';
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (cat === 'charts') {
        const data = (await res.json()) as ChartsResponse;
        setSpotifyTracks(data.tracks ?? []);
      } else {
        const data = (await res.json()) as NewReleasesResponse;
        setSpotifyTracks(
          data.albums.map((album) => ({
            id: album.id,
            name: album.name,
            uri: album.uri,
            artists: album.artists,
            album: { name: album.name, images: album.images },
            preview_url: null,
          }))
        );
      }
    } catch {
      setSnackbar({ message: '曲の取得に失敗しました', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchYoutube = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/youtube/trending');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as YouTubeTrendingResponse;
      setYoutubeVideos(data.videos ?? []);
    } catch {
      setSnackbar({ message: '動画の取得に失敗しました', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (platform === 'spotify') {
      void fetchSpotify(spotifyCategory);
    } else {
      void fetchYoutube();
    }
  }, [platform, spotifyCategory, fetchSpotify, fetchYoutube]);

  const handleSpotifyToggle = (uri: string) => {
    setSelectedSpotify((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  };

  const handleYoutubeToggle = (id: string) => {
    setSelectedYoutube((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedCount = platform === 'spotify' ? selectedSpotify.size : selectedYoutube.size;

  const handleConfirm = async (name: string) => {
    setCreating(true);
    try {
      if (platform === 'spotify') {
        const res = await fetch('/api/spotify/playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, trackUris: Array.from(selectedSpotify) }),
        });
        if (res.status === 401) {
          sessionStorage.setItem('spotifyPendingUris', JSON.stringify(Array.from(selectedSpotify)));
          sessionStorage.setItem('spotifyPendingName', name);
          await signIn('spotify');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { spotifyUrl: string };
        setDialogOpen(false);
        setSelectedSpotify(new Set());
        setSnackbar({ message: 'Spotify プレイリストを作成しました。', severity: 'success' });
        globalThis.open(data.spotifyUrl, '_blank');
      } else {
        const res = await fetch('/api/youtube/playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, videoIds: Array.from(selectedYoutube) }),
        });
        if (res.status === 401) {
          sessionStorage.setItem('youtubePendingIds', JSON.stringify(Array.from(selectedYoutube)));
          sessionStorage.setItem('youtubePendingName', name);
          await signIn('google');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { youtubeUrl: string };
        setDialogOpen(false);
        setSelectedYoutube(new Set());
        setSnackbar({ message: 'YouTube プレイリストを作成しました。', severity: 'success' });
        globalThis.open(data.youtubeUrl, '_blank');
      }
    } catch {
      setSnackbar({ message: 'プレイリストの作成に失敗しました', severity: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (platform === 'spotify') {
      if (spotifyTracks.length === 0) {
        return (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            曲が見つかりませんでした
          </Typography>
        );
      }
      return (
        <Grid container spacing={2}>
          {spotifyTracks.map((track) => (
            <Grid key={track.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
              <TrackCard
                track={track}
                selected={selectedSpotify.has(track.uri)}
                onToggle={handleSpotifyToggle}
              />
            </Grid>
          ))}
        </Grid>
      );
    }

    if (youtubeVideos.length === 0) {
      return (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          動画が見つかりませんでした
        </Typography>
      );
    }
    return (
      <Grid container spacing={2}>
        {youtubeVideos.map((video) => (
          <Grid key={video.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <YouTubeVideoCard
              video={video}
              selected={selectedYoutube.has(video.id)}
              onToggle={handleYoutubeToggle}
            />
          </Grid>
        ))}
      </Grid>
    );
  };

  const defaultName = platform === 'spotify' ? generatePlaylistName() : generateYouTubePlaylistName();

  return (
    <Box sx={{ pb: 10 }}>
      <PlatformTabs value={platform} onChange={setPlatform} />

      {platform === 'spotify' && (
        <CategoryTabs value={spotifyCategory} onChange={setSpotifyCategory} />
      )}

      {renderContent()}

      <PlaylistFooter selectedCount={selectedCount} onCreateClick={() => setDialogOpen(true)} />

      <CreatePlaylistDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={(name) => void handleConfirm(name)}
        loading={creating}
        defaultName={defaultName}
      />

      <Snackbar open={snackbar !== null} autoHideDuration={5000} onClose={() => setSnackbar(null)}>
        <Alert severity={snackbar?.severity} onClose={() => setSnackbar(null)}>
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
