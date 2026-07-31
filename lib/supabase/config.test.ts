import { expect, it } from "vitest";
import { getSupabasePublicConfig } from "./config";

it("requires both browser-safe Supabase settings", () => {
  expect(() => getSupabasePublicConfig({})).toThrow("Supabase is not configured");
  expect(
    getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    }),
  ).toEqual({ url: "https://example.supabase.co", publishableKey: "public-key" });
});
