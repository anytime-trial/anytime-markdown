import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "repo" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      (session as unknown as { accessToken: unknown }).accessToken = token.accessToken;
      return session;
    },
  },
};

export async function getGitHubToken(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  return (session as unknown as { accessToken?: string }).accessToken ?? null;
}
