import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Spotify from "next-auth/providers/spotify";
import { GITHUB_OAUTH_SCOPE } from "./githubOAuthScope";
import { isGoogleTokenExpired, parseRefreshedToken } from "./googleToken";

const result = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  // Netlify は VERCEL/CF_PAGES 環境変数がないため @auth/core の自動検知が効かない。
  // AUTH_TRUST_HOST か AUTH_URL がない場合でも信頼する（reverse proxy 後段で動作）。
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorization: { params: { scope: GITHUB_OAUTH_SCOPE } },
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
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        if (account.provider === "spotify") {
          token.spotifyAccessToken = account.access_token;
        } else if (account.provider === "google") {
          token.youtubeAccessToken = account.access_token;
          token.googleAccessToken = account.access_token;
          token.googleRefreshToken = account.refresh_token;
          token.googleTokenExpiresAt = account.expires_at
            ? account.expires_at * 1000
            : undefined;
        } else {
          token.accessToken = account.access_token;
        }
        return token;
      }

      if (
        token.googleRefreshToken &&
        isGoogleTokenExpired(token.googleTokenExpiresAt, Date.now())
      ) {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID ?? "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            grant_type: "refresh_token",
            refresh_token: token.googleRefreshToken,
          }),
        });
        if (res.ok) {
          const payload = (await res.json()) as Record<string, unknown>;
          const refreshed = parseRefreshedToken(payload, Date.now());
          if (refreshed) {
            token.googleAccessToken = refreshed.accessToken;
            token.googleTokenExpiresAt = refreshed.expiresAt;
          }
        } else {
          console.error(
            `[${new Date().toISOString()}] [ERROR] Google token refresh failed: ${res.status} ${await res.text()}`,
          );
        }
      }

      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken;
      session.spotifyAccessToken = token.spotifyAccessToken;
      session.googleAccessToken = token.googleAccessToken;
      session.youtubeAccessToken = token.googleAccessToken ?? token.youtubeAccessToken;
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

export async function getGoogleToken(): Promise<string | null> {
  const session = await auth();
  if (!session) return null;
  return session.googleAccessToken ?? null;
}
