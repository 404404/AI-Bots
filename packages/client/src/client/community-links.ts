/** Public community entry points, kept in step with the README Community section. */
export const COMMUNITY = {
  qqGroup: '1125565676',
  discord: 'https://discord.gg/aEB2Ayhu7B',
  github: 'https://github.com/BotHarness/DeepSeekBot',
  githubApi: 'https://api.github.com/repos/BotHarness/DeepSeekBot',
} as const;

const STARS_KEY = 'botharness/community/github-stars';

/** The last star count this device saw, so an offline intro still shows a number. */
export function cachedGithubStars(): number | undefined {
  try {
    const value = Number(localStorage.getItem(STARS_KEY));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Fetch the live star count; resolves undefined when offline, rate limited or slow. */
export async function fetchGithubStars(
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<number | undefined> {
  const timeout = AbortSignal.timeout(5000);
  try {
    const response = await request(COMMUNITY.githubApi, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.any([signal, timeout]),
    });
    if (!response.ok) return undefined;
    const stars = ((await response.json()) as { stargazers_count?: unknown }).stargazers_count;
    if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 0) return undefined;
    try {
      localStorage.setItem(STARS_KEY, String(stars));
    } catch {}
    return stars;
  } catch {
    return undefined;
  }
}

export function formatStars(count: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
      count,
    );
  } catch {
    return String(count);
  }
}
