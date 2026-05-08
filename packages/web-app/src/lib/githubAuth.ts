import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Spotify from "next-auth/providers/spotify";

const result = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  // Netlify は VERCEL/CF_PAGES 環境変数がないため @auth/core の自動検知が効かない。
  // AUTH_TRUST_HOST か AUTH_URL がない場合でも信頼する（reverse proxy 後段で動作）。
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "public_repo" } },
    }),
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "playlist-modify-public playlist-modify-private",
        },
      },
    }),
    Google({
      clientId: process.env.YOUTUBE_CLIENT_ID ?? "",
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/youtube.force-ssl",
        },
      },
    }),
  ],
  callbacks: {
    jwt({ token, account }) {
      if (account?.access_token) {
        if (account.provider === "spotify") {
          token.spotifyAccessToken = account.access_token;
        } else if (account.provider === "google") {
          token.youtubeAccessToken = account.access_token;
        } else {
          token.accessToken = account.access_token;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken;
      session.spotifyAccessToken = token.spotifyAccessToken;
      session.youtubeAccessToken = token.youtubeAccessToken;
      return session;
    },
  },
});

export const { handlers, auth, signIn, signOut } = result;

export async function getGitHubToken(): Promise<string | null> {
  const session = await auth();
  if (!session) return null;
  return session.accessToken ?? null;
}

export async function getSpotifyToken(): Promise<string | null> {
  const session = await auth();
  if (!session) return null;
  return session.spotifyAccessToken ?? null;
}

export async function getYouTubeToken(): Promise<string | null> {
  const session = await auth();
  if (!session) return null;
  return session.youtubeAccessToken ?? null;
}
