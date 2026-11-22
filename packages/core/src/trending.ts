export interface InstallStat {
  plugin_id: string;
  day: string; // YYYY-MM-DD
  installs: number;
  uninstalls: number;
}

/**
 * Trending score, computed on the device from the aggregated install events in Supabase.
 * Each day's net installs decay with a 3-day half-life, so a burst this week beats a slow
 * trickle last month. Uninstalls count half against the plugin.
 */
export function trendingScores(stats: InstallStat[], now = Date.now()): Map<string, number> {
  const scores = new Map<string, number>();
  for (const s of stats) {
    const ageDays = Math.max(0, (now - Date.parse(s.day + 'T12:00:00Z')) / 86_400_000);
    const weight = Math.pow(0.5, ageDays / 3);
    const net = s.installs - 0.5 * s.uninstalls;
    scores.set(s.plugin_id, (scores.get(s.plugin_id) ?? 0) + net * weight);
  }
  return scores;
}

export function rankTrending<T extends { id: string; name: string }>(items: T[], stats: InstallStat[], limit = 12): T[] {
  const scores = trendingScores(stats);
  return [...items]
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
