import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTrailI18n } from '../../i18n';

export interface SetupGuideProps {
  readonly onRecheck: () => void;
  readonly detail?: string;
}

export function SetupGuide({ onRecheck, detail }: Readonly<SetupGuideProps>) {
  const { t } = useTrailI18n();
  return (
    <Box sx={{ p: 4, overflowY: 'auto' }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
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
