/* eslint-disable @typescript-eslint/no-require-imports */
// next-auth モック: テスト環境でモジュール初期化時の fetch エラーを回避
module.exports = {
  useSession: () => ({ data: null, status: "unauthenticated" }),
  getServerSession: async () => null,
  default: () => {},
};

// next-auth/react サブパスもこのファイルで解決される
module.exports.SessionProvider = ({ children }) => children;
