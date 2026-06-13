FROM node:24-slim AS base

# curl のインストール
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /anytime-markdown /anytime-markdown-docs 
WORKDIR /anytime-markdown/

COPY package.json package-lock.json* ./
RUN npm ci

# 開発用ステージ
FROM base AS local

# Serena MCP サーバー用の Python パッケージマネージャー
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client sudo tmux sqlite3 jq && \
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

# Playwright のシステム依存パッケージのインストール（root で実行）
RUN npx playwright install-deps

# --- 【追加・修正】npm global の設定と環境変数 PATH の設定 ---
ENV NPM_CONFIG_PREFIX=/home/user/.npm-global
ENV PATH="/home/user/.npm-global/bin:/home/user/.local/bin:${PATH}"

# user ユーザーのホームディレクトリを準備
# (.npm-global フォルダもあらかじめ root 権限で作って所有者を user に変えておきます)
RUN mkdir -p /home/user/.ssh /home/user/.claude /home/user/.npm-global && \
    chown -R user:user /home/user /anytime-markdown /anytime-markdown-docs

USER user

# --- 【移動】USER user に切り替えた後に npm install -g を実行 ---
# これにより、/home/user/.npm-global 配下に sudo なしでインストールされ、Claude の自動更新が可能になります
RUN npm install -g \
        @anthropic-ai/claude-code \
        @openai/codex \
        @google/gemini-cli

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