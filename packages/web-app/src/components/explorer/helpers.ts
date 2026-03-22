import type { CommitEntry, TreeEntry } from "./types";

export async function fetchDirEntries(
  repo: string, branch: string, dirPath: string,
): Promise<TreeEntry[]> {
  const res = await fetch(
    `/api/github/content?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(dirPath)}&ref=${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return (data as { path: string; type: string; name: string }[])
    .map((item) => ({
      path: item.path,
      type: item.type === "dir" ? "tree" as const : "blob" as const,
      name: item.name,
    }))
    .filter(
      (e) => e.type === "tree" || e.name.endsWith(".md") || e.name.endsWith(".markdown"),
    )
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function fetchCommits(
  repo: string, filePath: string, branch?: string,
): Promise<{ commits: CommitEntry[]; stale: boolean }> {
  let url = `/api/github/commits?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}`;
  if (branch) url += `&branch=${encodeURIComponent(branch)}`;
  const res = await fetch(url);
  if (!res.ok) return { commits: [], stale: false };
  const data = await res.json();
  if (data && typeof data === "object" && "commits" in data) {
    return { commits: data.commits ?? [], stale: !!data.stale };
  }
  if (Array.isArray(data)) return { commits: data, stale: false };
  return { commits: [], stale: false };
}

export async function fetchBranches(repo: string): Promise<string[]> {
  const res = await fetch(`/api/github/branches?repo=${encodeURIComponent(repo)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function deleteFile(repo: string, filePath: string, branch: string): Promise<boolean> {
  const res = await fetch("/api/github/content", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, path: filePath, message: `Delete ${filePath}`, branch }),
  });
  return res.ok;
}

export async function createFile(repo: string, filePath: string, branch: string): Promise<{ path: string } | null> {
  const res = await fetch("/api/github/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, path: filePath, content: "", message: `Create ${filePath}`, branch }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { path: string };
}

export async function renameFile(repo: string, oldPath: string, newPath: string, branch: string): Promise<boolean> {
  const res = await fetch("/api/github/content", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, oldPath, newPath, branch }),
  });
  return res.ok;
}

export async function listAllFiles(repo: string, branch: string, dirPath: string): Promise<string[]> {
  const entries = await fetchDirEntries(repo, branch, dirPath);
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.type === "blob") {
      paths.push(entry.path);
    } else {
      const sub = await listAllFiles(repo, branch, entry.path);
      paths.push(...sub);
    }
  }
  return paths;
}

export function formatCommitDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function truncateMessage(msg: string, max = 40): string {
  const firstLine = msg.split("\n")[0];
  return firstLine.length > max ? firstLine.slice(0, max) + "..." : firstLine;
}
