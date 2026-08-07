import type { MessageKey } from "@/lib/i18n";

/** Matches the CHECK constraint on paper_quiz_profiles.username. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** The message key describing why a username is unusable, or null when it is fine. */
export function usernameError(value: string): MessageKey | null {
  const username = normalizeUsername(value);
  if (!username) return "auth.usernameRequired";
  return USERNAME_PATTERN.test(username) ? null : "auth.usernameInvalid";
}
