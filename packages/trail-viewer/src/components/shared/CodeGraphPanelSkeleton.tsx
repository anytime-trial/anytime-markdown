import { Box, CircularProgress, Skeleton, Typography } from '../../ui';

/**
 * CodeGraphPanel (sigma + graphology を内包) の React.lazy fallback。
 * ResizablePopup 内に表示される前提で、領域いっぱいに広がる軽量 Skeleton を返す。
 */
export function CodeGraphPanelSkeleton() {
    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
            }}
            role="status"
            aria-live="polite"
        >
            {/* 検索バー風 */}
            <Skeleton variant="rectangular" width="100%" height={40} />
            {/* メインの Canvas 領域 */}
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    border: '1px dashed',
                    borderColor: 'divider',
                    borderRadius: 1,
                }}
            >
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary">
                    Loading code graph…
                </Typography>
            </Box>
        </Box>
    );
}
