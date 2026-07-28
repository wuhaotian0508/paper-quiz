type Options = { limit: number; windowMs: number; now?: () => number };
type Result = { allowed: boolean; retryAfterSeconds: number };

export function createMemoryRateLimiter(options: Options) {
  const now = options.now || (() => Date.now());
  const entries = new Map<string, { startedAt: number; count: number }>();
  return {
    check(key: string): Result {
      const timestamp = now();
      const current = entries.get(key);
      if (!current || timestamp - current.startedAt >= options.windowMs) {
        entries.set(key, { startedAt: timestamp, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (current.count >= options.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((options.windowMs - (timestamp - current.startedAt)) / 1000),
          ),
        };
      }
      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

const REQUESTS_PER_MINUTE = 20;

/**
 * Fallback only. Each serverless instance gets its own Map, and the platform scales
 * instances out under load, so the effective limit is REQUESTS_PER_MINUTE multiplied by
 * however many instances are warm. Set UPSTASH_REDIS_REST_URL/TOKEN in production to
 * get a limit that actually holds across instances.
 */
const limiter = createMemoryRateLimiter({ limit: REQUESTS_PER_MINUTE, windowMs: 60_000 });

export async function requestRateLimit(request: Request): Promise<Result> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "anonymous";
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return limiter.check(key);
  try {
    const bucket = Math.floor(Date.now() / 60_000);
    const redisKey = `paper-quiz:rate:${bucket}:${encodeURIComponent(key)}`;
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["incr", redisKey],
        ["expire", redisKey, 60],
      ]),
    });
    if (!response.ok) return limiter.check(key);
    const result = (await response.json()) as Array<{ result?: number }>;
    const count = Number(result[0]?.result || 0);
    return count > REQUESTS_PER_MINUTE
      ? { allowed: false, retryAfterSeconds: 60 - (Math.floor(Date.now() / 1000) % 60) }
      : { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return limiter.check(key);
  }
}
