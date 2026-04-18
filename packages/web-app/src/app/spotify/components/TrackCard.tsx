'use client';

import { Box, Card, CardMedia, Checkbox, Typography } from '@mui/material';
import type { SpotifyTrack } from '../../../lib/spotify';

interface TrackCardProps {
  track: SpotifyTrack;
  selected: boolean;
  onToggle: (uri: string) => void;
}

export function TrackCard({ track, selected, onToggle }: Readonly<TrackCardProps>) {
  const imageUrl = track.album.images[0]?.url ?? '';
  const artistNames = track.artists.map((a) => a.name).join(', ');

  return (
    <Card
      onClick={() => onToggle(track.uri)}
      sx={{
        cursor: 'pointer',
        position: 'relative',
        outline: selected ? '2px solid' : 'none',
        outlineColor: 'primary.main',
        borderRadius: 2,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <CardMedia
        component="img"
        image={imageUrl}
        alt={`${track.name} のアルバムアート`}
        sx={{ aspectRatio: '1 / 1', width: '100%' }}
      />
      <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
        <Checkbox
          checked={selected}
          onChange={() => onToggle(track.uri)}
          onClick={(e) => e.stopPropagation()}
          size="small"
          sx={{ bgcolor: 'background.paper', borderRadius: 1, p: 0.5 }}
          inputProps={{ 'aria-label': `${track.name} を選択` }}
        />
      </Box>
      <Box sx={{ p: 1 }}>
        <Typography variant="caption" noWrap fontWeight="bold">
          {track.name}
        </Typography>
        <Typography variant="caption" noWrap display="block" color="text.secondary">
          {artistNames}
        </Typography>
      </Box>
    </Card>
  );
}
