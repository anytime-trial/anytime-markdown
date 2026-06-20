import { Box, Skeleton, Stack } from '../../ui';

export function AnalyticsPanelSkeleton() {
    return (
        <Box sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <Skeleton variant="rectangular" width="25%" height={140} />
                <Skeleton variant="rectangular" width="25%" height={140} />
                <Skeleton variant="rectangular" width="25%" height={140} />
                <Skeleton variant="rectangular" width="25%" height={140} />
            </Stack>
            <Skeleton variant="rectangular" width="100%" height={280} sx={{ mb: 2 }} />
            <Skeleton variant="rectangular" width="100%" height={400} />
        </Box>
    );
}
