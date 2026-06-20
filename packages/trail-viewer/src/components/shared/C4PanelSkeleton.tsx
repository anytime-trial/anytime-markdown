import { Box, Skeleton } from '../../ui';

export function C4PanelSkeleton() {
    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '70vh' }}>
            <Skeleton variant="rectangular" width="100%" height={48} sx={{ mb: 2 }} />
            <Box sx={{ flex: 1, display: 'flex', gap: 2 }}>
                <Skeleton variant="rectangular" sx={{ flex: 1 }} />
                <Skeleton variant="rectangular" width={300} />
            </Box>
        </Box>
    );
}
