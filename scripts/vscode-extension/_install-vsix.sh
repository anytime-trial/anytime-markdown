#!/usr/bin/env bash
# Install a VSIX via the VS Code Remote CLI, robust against stale $VSCODE_IPC_HOOK_CLI.
#
# In a long-lived shell session (Claude Code, tmux, devcontainer) the IPC socket
# path can outlive the VS Code window that created it. `code --install-extension`
# then fails with `ENOENT /tmp/vscode-ipc-*.sock`. Detect the broken socket and
# fall back to the most recently modified `/tmp/vscode-ipc-*.sock` so a fresh
# VS Code session is picked up automatically.
#
# Usage: _install-vsix.sh <path-to-vsix>

set -euo pipefail

VSIX_PATH="${1:?usage: _install-vsix.sh <vsix-path>}"

if [ ! -f "$VSIX_PATH" ]; then
  echo "[install-vsix] vsix not found: $VSIX_PATH" >&2
  exit 1
fi

# Pick the freshest available socket if the current hint is missing or stale.
if [ -z "${VSCODE_IPC_HOOK_CLI:-}" ] || [ ! -S "${VSCODE_IPC_HOOK_CLI:-}" ]; then
  LATEST_SOCK="$(ls -t /tmp/vscode-ipc-*.sock 2>/dev/null | head -n 1 || true)"
  if [ -n "$LATEST_SOCK" ] && [ -S "$LATEST_SOCK" ]; then
    if [ -n "${VSCODE_IPC_HOOK_CLI:-}" ]; then
      echo "[install-vsix] stale VSCODE_IPC_HOOK_CLI=$VSCODE_IPC_HOOK_CLI -> using $LATEST_SOCK" >&2
    else
      echo "[install-vsix] VSCODE_IPC_HOOK_CLI unset -> using $LATEST_SOCK" >&2
    fi
    export VSCODE_IPC_HOOK_CLI="$LATEST_SOCK"
  else
    echo "[install-vsix] no /tmp/vscode-ipc-*.sock found; skipping install. Restart VS Code or install $VSIX_PATH manually." >&2
    exit 0
  fi
fi

code --install-extension "$VSIX_PATH" --force
