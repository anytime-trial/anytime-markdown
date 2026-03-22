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
    git openssh-client sudo tmux && \
    echo "node ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers && \
    rm -rf /var/lib/apt/lists/*

# Claude Code CLI のインストール
RUN npm install -g @anthropic-ai/claude-code

# Playwright のシステム依存パッケージのインストール（root で実行）
RUN npx playwright install-deps

ENV PATH="/home/node/.local/bin:${PATH}"

# nodeユーザーのホームディレクトリを準備
RUN mkdir -p /home/node/.ssh /home/node/.claude && \
    chown -R node:node /home/node

# 作業ディレクトリの権限をnodeユーザーに変更
RUN chown -R node:node /anytime-markdown
RUN chown -R node:node /anytime-markdown-docs
RUN chown -R node:node /prompt

USER node

# Playwright ブラウザのインストール（node ユーザーで実行）
RUN npx playwright install

COPY --chown=node:node . .

ENTRYPOINT ["sleep", "infinity"]

# 開発サーバー用ステージ
FROM base AS development

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "dev"]
