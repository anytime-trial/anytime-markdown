FROM node:24-slim AS base

# curl のインストール
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /anytime-markdown/
WORKDIR /anytime-markdown-docs/
WORKDIR /prompt/

COPY ./package.json ./
RUN npm install

# 開発用ステージ
FROM base AS local

# Serena MCP サーバー用の Python パッケージマネージャー
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client sudo tmux sqlite3 && \
    groupmod -n user node && \
    usermod -l user -d /home/user -m node && \
    echo "user ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers && \
    rm -rf /var/lib/apt/lists/* && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update -qq && apt-get install -y -qq gh && \
    rm -rf /var/lib/apt/lists/*

# Claude Code CLI のインストール
RUN npm install -g @anthropic-ai/claude-code

# OpenAI Codex CLI のインストール
RUN npm install -g @openai/codex

# Gemini CLI のインストール
RUN npm install -g @google/gemini-cli

# Playwright のシステム依存パッケージのインストール（root で実行）
RUN npx playwright install-deps

ENV PATH="/home/user/.local/bin:${PATH}"

# user ユーザーのホームディレクトリを準備
RUN mkdir -p /home/user/.ssh /home/user/.claude && \
    chown -R user:user /home/user

# 作業ディレクトリの権限を user ユーザーに変更
RUN chown -R user:user /anytime-markdown
RUN chown -R user:user /anytime-markdown-docs
RUN chown -R user:user /prompt

USER user

# Playwright ブラウザのインストール（user ユーザーで実行）
RUN npx playwright install

COPY --chown=user:user . .

ENTRYPOINT ["sleep", "infinity"]

# 開発サーバー用ステージ
FROM base AS development

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "dev"]
