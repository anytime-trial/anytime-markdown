export function formatRelativeTime(isoDate: string): string {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 1) return '< 1h';
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export function formatRank(n: number): string {
    return String(n).padStart(2, '0');
}
