import { Alert, Box, Button, Stack, Typography } from '../../ui';
import { useTrailI18n } from '../../i18n';

export interface SetupGuideProps {
  readonly onRecheck: () => void;
  readonly detail?: string;
}

export function SetupGuide({ onRecheck, detail }: Readonly<SetupGuideProps>) {
  const { t } = useTrailI18n();
  return (
    <Box sx={{ p: 4, overflowY: 'auto' }}>
      <Box sx={{ mb: 2 }}>
        <Alert severity="warning">
          <Typography variant="h6">{t('memory.chat.setup.title')}</Typography>
          {detail && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}
            >
              {detail}
            </Typography>
          )}
        </Alert>
      </Box>
      <Stack spacing={1}>
        <Typography>{t('memory.chat.setup.step1')}</Typography>
        <Typography>{t('memory.chat.setup.step2')}</Typography>
        <Typography>{t('memory.chat.setup.step3')}</Typography>
      </Stack>
      <Button variant="contained" sx={{ mt: 2 }} onClick={onRecheck}>
        {t('memory.chat.setup.recheck')}
      </Button>
    </Box>
  );
}
