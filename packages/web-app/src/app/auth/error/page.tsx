import { Box, Button, Typography } from '@mui/material';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { validateAuthEnv } from '../../../lib/authEnv';

type Props = {
  searchParams: Promise<{ error?: string }>;
};

type AuthErrorVariant = 'config' | 'expired' | 'generic';

function resolveVariant(isHealthy: boolean, error: string | undefined): AuthErrorVariant {
  if (!isHealthy) return 'config';
  if (error === 'Configuration') return 'expired';
  return 'generic';
}

function AuthErrorActions({ retryEditor, retryHome }: Readonly<{ retryEditor: string; retryHome: string }>) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5, mt: 1 }}>
      <Button component={Link} href="/markdown" variant="contained">
        {retryEditor}
      </Button>
      <Button component={Link} href="/" variant="outlined">
        {retryHome}
      </Button>
    </Box>
  );
}

export default async function AuthErrorPage({ searchParams }: Readonly<Props>) {
  const t = await getTranslations('AuthError');
  const { error } = await searchParams;
  const authEnvStatus = validateAuthEnv(process.env);

  const invalidVars = authEnvStatus.invalid.map((item) => item.name);
  const configVars = [...authEnvStatus.missingRequired, ...invalidVars];

  // Auth.js は clientErrors 許可リスト外の例外をすべて error=Configuration に潰す（@auth/core index.js）。
  // そのため error だけでは「設定不備」と「PKCE 失効などの検査失敗」を区別できない。実行時 env が
  // 健全かどうかを自分で確かめ、設定不備でないなら失効（時間切れ）として案内する。
  const variant = resolveVariant(authEnvStatus.isHealthy, error);
  const title = t(`${variant}Title`);
  const description = t(`${variant}Description`);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
        px: 3,
        textAlign: 'center',
      }}
    >
      <Typography variant="h4" component="h1" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640 }}>
        {description}
      </Typography>
      {!authEnvStatus.isHealthy ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" component="h2">
            {t('missingVarsLabel')}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 3, textAlign: 'left' }}>
            {configVars.map((name) => (
              <Typography key={name} component="li" variant="body2" color="text.secondary">
                {name}
              </Typography>
            ))}
          </Box>
        </Box>
      ) : null}
      <AuthErrorActions retryEditor={t('retryEditor')} retryHome={t('retryHome')} />
    </Box>
  );
}
