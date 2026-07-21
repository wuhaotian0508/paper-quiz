import type { Quiz } from "./quiz";

export type QuizResponse = Quiz | { error?: string };

export async function readQuizResponse(response: Response): Promise<QuizResponse> {
  const body = await response.text();

  try {
    return JSON.parse(body) as QuizResponse;
  } catch {
    const contentType = response.headers.get("content-type") ?? "";
    const isHtml = contentType.includes("text/html") || /^\s*</.test(body);

    if (!response.ok && isHtml) {
      throw new Error(`The server returned an HTML error page (HTTP ${response.status}). Please try again.`);
    }
    if (!response.ok) {
      throw new Error(`The server returned an error (HTTP ${response.status}). Please try again.`);
    }
    throw new Error("The server returned data in an unexpected format. Please refresh and try again.");
  }
}
