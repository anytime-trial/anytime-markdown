import { cookies } from "next/headers";

export async function getGitHubToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("github_token")?.value ?? null;
}
