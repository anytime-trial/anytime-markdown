import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import { useTrailI18n } from '../../i18n';

export type RepoScope = 'all' | 'current';

export interface FiltersPanelProps {
  readonly repoScope: RepoScope;
  readonly onRepoScopeChange: (scope: RepoScope) => void;
}

export function FiltersPanel({
  repoScope,
  onRepoScopeChange,
}: Readonly<FiltersPanelProps>) {
  const { t } = useTrailI18n();
  return (
    <Box
      sx={{
        borderRight: '1px solid',
        borderColor: 'divider',
        p: 1,
        overflowY: 'auto',
      }}
    >
      <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>
        {t('memory.chat.filters.title')}
      </Typography>
      <FormControl>
        <RadioGroup
          value={repoScope}
          onChange={(_, v) => onRepoScopeChange(v as RepoScope)}
        >
          <FormControlLabel
            value="all"
            control={<Radio size="small" />}
            label={t('memory.chat.filters.allRepos')}
          />
          <FormControlLabel
            value="current"
            control={<Radio size="small" />}
            label={t('memory.chat.filters.currentRepo')}
          />
        </RadioGroup>
      </FormControl>
    </Box>
  );
}
