export interface ProviderQuotaWindow {
  resetAt: string;
  reason: string;
}

const QUOTA_PATTERN =
  /usage\s+limit|rate[_ -]?limit|quota\s+(?:exceeded|exhausted|reached)|(?:hit|reached|exceeded)\s+(?:your\s+)?(?:usage\s+)?limit|too many requests|resource_exhausted|insufficient_quota|(?:status|code)["']?\s*[:=]\s*429/i;

function relativeMilliseconds(text: string): number | null {
  const match = text.match(
    /(?:try again|reset(?:s)?|available again)[^\n]{0,40}?in\s+(?:about\s+)?(?:(\d+)\s*d(?:ays?)?\s*)?(?:(\d+)\s*h(?:ours?)?\s*)?(?:(\d+)\s*m(?:in(?:ute)?s?)?\s*)?(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?/i,
  );
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const duration =
    Number(days ?? 0) * 86_400_000 +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1_000;
  return duration > 0 ? duration : null;
}

export function detectProviderQuota(
  content: string,
  now = new Date(),
): ProviderQuotaWindow | null {
  if (!QUOTA_PATTERN.test(content)) return null;

  const relative = relativeMilliseconds(content);
  if (relative)
    return {
      resetAt: new Date(now.getTime() + relative).toISOString(),
      reason: content.trim().slice(0, 500),
    };

  const epoch = content.match(
    /["']?(?:reset_at|resets_at|resetAt)["']?\s*[:=]\s*["']?(\d{10,13})/i,
  )?.[1];
  if (epoch) {
    const value = Number(epoch);
    const resetAt = new Date(epoch.length === 10 ? value * 1000 : value);
    if (resetAt.getTime() > now.getTime())
      return { resetAt: resetAt.toISOString(), reason: content.trim().slice(0, 500) };
  }

  const iso = content.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/,
  )?.[0];
  if (iso) {
    const resetAt = new Date(iso);
    if (resetAt.getTime() > now.getTime())
      return { resetAt: resetAt.toISOString(), reason: content.trim().slice(0, 500) };
  }

  const clock = content.match(
    /reset(?:s)?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
  );
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2] ?? 0);
    const meridiem = clock[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    const resetAt = new Date(now);
    resetAt.setHours(hour, minute, 0, 0);
    if (resetAt.getTime() <= now.getTime())
      resetAt.setDate(resetAt.getDate() + 1);
    return { resetAt: resetAt.toISOString(), reason: content.trim().slice(0, 500) };
  }

  // Providers do not always expose an exact reset header through their CLI.
  // Use a short conservative window instead of retrying on every scheduler tick.
  return {
    resetAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    reason: `${content.trim().slice(0, 450)} [reset estimated by Spline: 15 minutes]`,
  };
}
