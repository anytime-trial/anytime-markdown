'use client';

import { Box, Card, CardMedia, Checkbox, Typography } from '@mui/material';

import type { YouTubeVideo } from '../../../lib/youtube';

interface YouTubeVideoCardProps {
  video: YouTubeVideo;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function YouTubeVideoCard({ video, selected, onToggle }: Readonly<YouTubeVideoCardProps>) {
  return (
    <Card
      onClick={() => onToggle(video.id)}
      sx={{
        cursor: 'pointer',
        position: 'relative',
        outline: selected ? '2px solid' : 'none',
        outlineColor: 'error.main',
        borderRadius: 2,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <CardMedia
        component="img"
        image={video.thumbnailUrl}
        alt={`${video.title} のサムネイル`}
        sx={{ aspectRatio: '16 / 9', width: '100%' }}
      />
      <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
        <Checkbox
          checked={selected}
          onChange={() => onToggle(video.id)}
          onClick={(e) => e.stopPropagation()}
          size="small"
          sx={{ bgcolor: 'background.paper', borderRadius: 1, p: 0.5 }}
          inputProps={{ 'aria-label': `${video.title} を選択` }}
        />
      </Box>
      <Box sx={{ p: 1 }}>
        <Typography variant="caption" noWrap fontWeight="bold">
          {video.title}
        </Typography>
        <Typography variant="caption" noWrap display="block" color="text.secondary">
          {video.channelTitle}
        </Typography>
      </Box>
    </Card>
  );
}
