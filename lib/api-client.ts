/**
 * Matches `maxDuration` on the API routes. The platform kills the function at that
 * point regardless, so aborting here lets the UI say what actually happened instead of
 * surfacing a generic network failure.
 */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Quiz generation gets a longer budget: more content to read and more questions to write. */
export const QUIZ_TIMEOUT_MS = 100_000;

export async function postForm(
  path: string,
  form: FormData,
  options: { timeoutMs?: number; timeoutMessage: string },
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(path, { method: "POST", body: form, signal: controller.signal });
  } catch (cause) {
    if (controller.signal.aborted) throw new Error(options.timeoutMessage);
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}
