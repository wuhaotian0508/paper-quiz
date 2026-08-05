import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const { getSupabaseServerClient } = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

it("exchanges an auth code before redirecting home", async () => {
  const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
  getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

  const response = await GET(
    new NextRequest("https://paper-quiz-ai-amber.vercel.app/auth/callback?code=code-123"),
  );

  expect(exchangeCodeForSession).toHaveBeenCalledWith("code-123");
  expect(response.headers.get("location")).toBe("https://paper-quiz-ai-amber.vercel.app/");
});

it("returns to a safe shared artifact after authentication", async () => {
  const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
  getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

  const response = await GET(
    new NextRequest(
      "https://paper-quiz-ai-amber.vercel.app/auth/callback?code=code-123&returnTo=%2Freview%2Freview-123",
    ),
  );

  expect(response.headers.get("location")).toBe(
    "https://paper-quiz-ai-amber.vercel.app/review/review-123",
  );
});

it("does not follow an external return target", async () => {
  const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
  getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

  const response = await GET(
    new NextRequest(
      "https://paper-quiz-ai-amber.vercel.app/auth/callback?code=code-123&returnTo=https%3A%2F%2Fattacker.example",
    ),
  );

  expect(response.headers.get("location")).toBe("https://paper-quiz-ai-amber.vercel.app/");
});

it("does not reflect an untrusted callback origin in its redirect", async () => {
  const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
  getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

  const response = await GET(
    new NextRequest("https://attacker.example/auth/callback?code=code-123"),
  );

  expect(response.headers.get("location")).toBe("https://paper-quiz-ai-amber.vercel.app/");
});

it("redirects to an auth error when the callback cannot exchange a code", async () => {
  const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: new Error("expired") });
  getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

  const response = await GET(
    new NextRequest("https://paper-quiz-ai-amber.vercel.app/auth/callback?code=expired"),
  );

  expect(response.headers.get("location")).toBe(
    "https://paper-quiz-ai-amber.vercel.app/login?authError=callback",
  );
});

it("redirects to an auth error when the callback code is missing", async () => {
  const response = await GET(
    new NextRequest("https://paper-quiz-ai-amber.vercel.app/auth/callback"),
  );

  expect(getSupabaseServerClient).not.toHaveBeenCalled();
  expect(response.headers.get("location")).toBe(
    "https://paper-quiz-ai-amber.vercel.app/login?authError=callback",
  );
});
