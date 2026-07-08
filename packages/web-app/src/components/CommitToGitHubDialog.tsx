"use client";

import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { type FC, type SyntheticEvent, useEffect, useState } from "react";

import type { GitHubRepo } from "./explorer/types";

/** 確定時に呼び出し側（useEditorPage）へ渡す入力値。実際の PUT は呼び出し側が行う。 */
export interface CommitToGitHubValues {
  repo: string;
  branch: string;
  path: string;
  message: string;
}

interface CommitToGitHubDialogProps {
  open: boolean;
  defaultPath: string;
  onConfirm: (values: CommitToGitHubValues) => void;
  onCancel: () => void;
}

function parseGitHubRepos(value: unknown): GitHubRepo[] {
  if (!Array.isArray(value)) return [];
  const repos: GitHubRepo[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.fullName === "string" && typeof rec.private === "boolean" && typeof rec.defaultBranch === "string") {
      repos.push({ fullName: rec.fullName, private: rec.private, defaultBranch: rec.defaultBranch });
    }
  }
  return repos;
}

function parseBranchNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** 末尾が `.md` でなければ補完する（既知の要件: ファイルパスは常に Markdown 拡張子）。 */
function ensureMdExtension(path: string): string {
  const trimmed = path.trim();
  return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

async function loadRepos(): Promise<GitHubRepo[]> {
  try {
    const res = await fetch("/api/github/repos");
    const data: unknown = res.ok ? await res.json() : [];
    return parseGitHubRepos(data);
  } catch (error) {
    console.warn("[CommitToGitHubDialog] Failed to load repositories:", error);
    return [];
  }
}

async function loadBranches(repo: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/github/branches?repo=${encodeURIComponent(repo)}`);
    const data: unknown = res.ok ? await res.json() : [];
    return parseBranchNames(data);
  } catch (error) {
    console.warn("[CommitToGitHubDialog] Failed to load branches:", error);
    return [];
  }
}

/**
 * 編集中ドキュメント（Drive/ローカル/取り込み/GitHub いずれのソースでも）を
 * 任意のリポジトリ・ブランチ・パスへ GitHub コミットするための入力ダイアログ。
 * 実際の内容取得・PUT 実行は呼び出し側（useEditorPage）の責務とし、
 * このコンポーネントは入力値の収集のみを担う。
 */
export const CommitToGitHubDialog: FC<Readonly<CommitToGitHubDialogProps>> = ({
  open,
  defaultPath,
  onConfirm,
  onCancel,
}) => {
  const t = useTranslations("Common");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState(defaultPath);
  const [message, setMessage] = useState(`Add ${defaultPath}`);

  // ダイアログを開くたびにフォームを初期化し、リポジトリ一覧を取得する。
  useEffect(() => {
    if (!open) return;
    setPath(ensureMdExtension(defaultPath));
    setMessage(`Add ${defaultPath}`);
    setSelectedRepo(null);
    setBranch("main");
    setBranchOptions([]);
    setReposLoading(true);
    loadRepos()
      .then((loaded) => setRepos(loaded))
      .finally(() => setReposLoading(false));
  }, [open, defaultPath]);

  const handleSelectRepo = (_event: SyntheticEvent, repo: GitHubRepo | null): void => {
    setSelectedRepo(repo);
    if (!repo) {
      setBranchOptions([]);
      setBranch("main");
      return;
    }
    setBranch(repo.defaultBranch);
    setBranchesLoading(true);
    loadBranches(repo.fullName)
      .then((loaded) => setBranchOptions(loaded))
      .finally(() => setBranchesLoading(false));
  };

  const canConfirm = !!selectedRepo && branch.trim() !== "" && path.trim() !== "" && message.trim() !== "";

  const handleConfirm = (): void => {
    if (!selectedRepo) return;
    onConfirm({
      repo: selectedRepo.fullName,
      branch: branch.trim(),
      path: ensureMdExtension(path),
      message: message.trim(),
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontSize: "0.95rem" }}>{t("githubCommitDialogTitle")}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <Autocomplete
          options={repos}
          loading={reposLoading}
          value={selectedRepo}
          onChange={handleSelectRepo}
          getOptionLabel={(repo) => repo.fullName}
          isOptionEqualToValue={(option, value) => option.fullName === value.fullName}
          renderInput={(params) => (
            <TextField {...params} label={t("githubCommitRepoLabel")} helperText="" />
          )}
        />
        <Autocomplete
          freeSolo
          options={branchOptions}
          loading={branchesLoading}
          inputValue={branch}
          onInputChange={(_event, value) => setBranch(value)}
          renderInput={(params) => (
            <TextField {...params} label={t("githubCommitBranchLabel")} helperText="" />
          )}
        />
        <TextField
          fullWidth
          label={t("githubCommitPathLabel")}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          helperText=""
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label={t("githubCommitMessageLabel")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          helperText=""
        />
        {!reposLoading && repos.length === 0 && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("noRepositoriesFound")}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} aria-label={t("cancel")} sx={{ textTransform: "none" }}>
          {t("cancel")}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!canConfirm}
          aria-label={t("githubCommitConfirm")}
          sx={{ textTransform: "none" }}
        >
          {t("githubCommitConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
