import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    spotifyAccessToken?: string;
    youtubeAccessToken?: string;
    googleAccessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    spotifyAccessToken?: string;
    youtubeAccessToken?: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleTokenExpiresAt?: number;
  }
}
