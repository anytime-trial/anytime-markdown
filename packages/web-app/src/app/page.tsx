'use client';

import dynamic from 'next/dynamic';
import { Box, CircularProgress } from '@mui/material';

const MarkdownEditorPage = dynamic(
  () => import('@anytime-markdown/editor-core/src/MarkdownEditorPage'),
  {
    ssr: false,
    loading: () => (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    ),
  }
);

export default function Page() {
  return <MarkdownEditorPage />;
}
