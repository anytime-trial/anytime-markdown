'use client';

import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

export interface TicketsRepoSelection {
  repo: string;
  branch: string;
}

interface TicketsRepoDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: TicketsRepoSelection) => void;
}

interface RepoEntry {
  fullName: string;
  defaultBranch?: string;
}

/** チケット正本のリポジトリ・ブランチ選択（GitHub 未接続時は接続導線を出す） */
export default function TicketsRepoDialog({ open, onClose, onSelect }: Readonly<TicketsRepoDialogProps>) {
  const t = useTranslations('tickets');
  const [repos, setRepos] = useState<RepoEntry[] | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [needsConnect, setNeedsConnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsConnect(false);
    try {
      const res = await fetch('/api/github/repos');
      if (res.status === 401 || res.status === 403) {
        setNeedsConnect(true);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const list = (await res.json()) as { full_name?: string; fullName?: string; default_branch?: string }[];
      setRepos(
        list.map((item) => ({
          fullName: item.full_name ?? item.fullName ?? '',
          defaultBranch: item.default_branch,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadRepos();
    }
  }, [open, loadRepos]);

  useEffect(() => {
    if (repo === '') {
      setBranches([]);
      return;
    }
    let cancelled = false;
    const loadBranches = async () => {
      try {
        const res = await fetch(`/api/github/branches?repo=${encodeURIComponent(repo)}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const names = (await res.json()) as string[];
        if (!cancelled) {
          setBranches(names);
          const preferred = repos?.find((item) => item.fullName === repo)?.defaultBranch;
          setBranch(preferred && names.includes(preferred) ? preferred : (names[0] ?? ''));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [repo, repos]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('repo.select')}</DialogTitle>
      <DialogContent>
        {needsConnect && (
          <Stack spacing={2} alignItems="flex-start">
            <Alert severity="info">{t('repo.empty')}</Alert>
            <Button
              variant="contained"
              onClick={() => void signIn('github', { callbackUrl: globalThis.location.href })}
            >
              GitHub
            </Button>
          </Stack>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {loading && <CircularProgress size={24} aria-label={t('common.loading')} />}
        {!needsConnect && repos && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label={t('repo.select')}
              value={repo}
              onChange={(event) => setRepo(event.target.value)}
              fullWidth
            >
              {repos.map((item) => (
                <MenuItem key={item.fullName} value={item.fullName}>
                  {item.fullName}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              disabled={branches.length === 0}
              fullWidth
            >
              {branches.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('create.cancel')}</Button>
        <Button
          variant="contained"
          disabled={repo === '' || branch === ''}
          onClick={() => {
            onSelect({ repo, branch });
            onClose();
          }}
        >
          {t('create.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
