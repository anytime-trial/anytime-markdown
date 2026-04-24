'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import React from 'react';

interface TrailErrorBoundaryProps {
  readonly children: React.ReactNode;
}

interface TrailErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class TrailErrorBoundary extends React.Component<
  TrailErrorBoundaryProps,
  TrailErrorBoundaryState
> {
  constructor(props: TrailErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TrailErrorBoundaryState {
    return { hasError: true, error };
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box
          role="alert"
          aria-live="assertive"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: 'calc(100vh - 64px)',
            gap: 2,
            p: 4,
          }}
        >
          <Typography variant="h6" color="error">
            表示中にエラーが発生しました
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {this.state.error?.message ?? 'Unknown error'}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            再試行
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
