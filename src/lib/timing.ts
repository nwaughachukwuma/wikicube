import type { WikiEntry } from "./types";

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

export function dayAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export interface TimeGroup {
  label: string;
  wikis: WikiEntry[];
}
export function segmentByTime(wikis: WikiEntry[]): TimeGroup[] {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  // Start of this week (Monday)
  const startOfThisWeek = new Date(startOfToday);
  const dayOfWeek = startOfToday.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfThisWeek.setDate(startOfThisWeek.getDate() - diffToMonday);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  // Start of this month
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Start of last month
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const buckets: Record<string, WikiEntry[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    "Last Week": [],
    "This Month": [],
    "Last Month": [],
    Older: [],
  };

  for (const wiki of wikis) {
    const d = new Date(wiki.updated_at);

    if (d >= startOfToday) {
      buckets["Today"].push(wiki);
    } else if (d >= startOfYesterday) {
      buckets["Yesterday"].push(wiki);
    } else if (d >= startOfThisWeek) {
      buckets["This Week"].push(wiki);
    } else if (d >= startOfLastWeek) {
      buckets["Last Week"].push(wiki);
    } else if (d >= startOfThisMonth) {
      buckets["This Month"].push(wiki);
    } else if (d >= startOfLastMonth) {
      buckets["Last Month"].push(wiki);
    } else {
      buckets["Older"].push(wiki);
    }
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, wikis: items }));
}
