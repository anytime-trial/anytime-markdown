'use client';

import { useState, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { Box, Grid, Snackbar, Alert, CircularProgress, Typography } from '@mui/material';
import { CategoryTabs, type SpotifyCategory } from './components/CategoryTabs';
import { TrackCard } from './components/TrackCard';
import { PlaylistFooter } from './components/PlaylistFooter';
import { CreatePlaylistDialog } from './components/CreatePlaylistDialog';
import type { SpotifyTrack } from '../../lib/spotify';

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

export function SpotifyPageContent() {
  const [category, setCategory] = useState<SpotifyCategory>('charts');
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const fetchTracks = useCallback(async (cat: SpotifyCategory) => {
    setLoading(true);
    try {
      const endpoint = cat === 'charts' ? '/api/spotify/charts' : '/api/spotify/new-releases';
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (cat === 'charts') {
        const data = (await res.json()) as ChartsResponse;
        setTracks(data.tracks ?? []);
      } else {
        const data = (await res.json()) as NewReleasesResponse;
        setTracks(
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

  useEffect(() => {
    void fetchTracks(category);
  }, [category, fetchTracks]);

  const handleToggle = (uri: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  };

  const handleConfirm = async (name: string) => {
    setCreating(true);
    try {
      const res = await fetch('/api/spotify/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, trackUris: Array.from(selected) }),
      });

      if (res.status === 401) {
        sessionStorage.setItem('spotifyPendingUris', JSON.stringify(Array.from(selected)));
        sessionStorage.setItem('spotifyPendingName', name);
        await signIn('spotify');
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as { spotifyUrl: string };
      setDialogOpen(false);
      setSelected(new Set());
      setSnackbar({ message: 'プレイリストを作成しました。', severity: 'success' });
      globalThis.open(data.spotifyUrl, '_blank');
    } catch {
      setSnackbar({ message: 'プレイリストの作成に失敗しました', severity: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ pb: 10 }}>
      <CategoryTabs value={category} onChange={setCategory} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : tracks.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          曲が見つかりませんでした
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {tracks.map((track) => (
            <Grid key={track.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
              <TrackCard
                track={track}
                selected={selected.has(track.uri)}
                onToggle={handleToggle}
              />
            </Grid>
          ))}
        </Grid>
      )}

      <PlaylistFooter
        selectedCount={selected.size}
        onCreateClick={() => setDialogOpen(true)}
      />

      <CreatePlaylistDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={(name) => void handleConfirm(name)}
        loading={creating}
      />

      <Snackbar
        open={snackbar !== null}
        autoHideDuration={5000}
        onClose={() => setSnackbar(null)}
      >
        <Alert severity={snackbar?.severity} onClose={() => setSnackbar(null)}>
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
