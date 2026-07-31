const feedbackAddress = "haotianwu123@berkeley.edu";
const feedbackSubject = "Paper Plane Quiz feedback";

export function createFeedbackHref(context?: string) {
  const contextLine = context?.trim() ? `Context: ${context.trim()}\n\n` : "";
  const body = `What were you doing?\n\n${contextLine}What went wrong or could be better?\n\nPage URL: `;

  return `mailto:${feedbackAddress}?subject=${encodeURIComponent(feedbackSubject)}&body=${encodeURIComponent(body)}`;
}
