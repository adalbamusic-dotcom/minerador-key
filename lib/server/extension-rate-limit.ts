type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

/** Melhor esforço local; proteção distribuída continua dependente da infraestrutura. */
export function consumeExtensionRateLimit(userId: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const current = buckets.get(userId);
  if (!current || current.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export const extensionRateLimitConfig = { windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS_PER_WINDOW } as const;
