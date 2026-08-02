'use client';

import { Box, Button, Typography } from '@mui/material';

interface PlaylistFooterProps {
  selectedCount: number;
  onCreateClick: () => void;
}

export function PlaylistFooter({ selectedCount, onCreateClick }: Readonly<PlaylistFooterProps>) {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        px: 3,
        py: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 100,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {selectedCount > 0 ? `${selectedCount}曲選択中` : '曲を選択してください'}
      </Typography>
      <Button
        variant="contained"
        disabled={selectedCount === 0}
        onClick={onCreateClick}
        sx={{ minWidth: 200 }}
      >
        Spotify にプレイリスト作成
      </Button>
    </Box>
  );
}
