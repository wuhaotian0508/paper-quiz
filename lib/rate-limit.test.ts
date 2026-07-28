import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("allows a bounded number of requests and rejects the next one", () => {
    const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 60_000, now: () => 1000 });
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });
});
