import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Spotify from "next-auth/providers/spotify";

const result = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
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
  ],
  callbacks: {
    jwt({ token, account }) {
      if (account?.access_token) {
        if (account.provider === "spotify") {
          token.spotifyAccessToken = account.access_token;
        } else {
          token.accessToken = account.access_token;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken;
      session.spotifyAccessToken = token.spotifyAccessToken;
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
