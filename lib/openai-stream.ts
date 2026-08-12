/** Token counts the Responses API reports once a response finishes. */
export type ResponseUsage = { inputTokens: number; outputTokens: number };

export type ResponseDeltaEvent = {
  type?: string;
  delta?: string;
  response?: {
    status?: string | null;
    error?: { code?: string | null; message?: string | null } | null;
    incomplete_details?: { reason?: string | null } | null;
    usage?: {
      input_tokens?: number | null;
      output_tokens?: number | null;
    } | null;
  } | null;
};

export type CollectedResponse = {
  text: string;
  /**
   * Why the model stopped early, or null if it finished. `"max_output_tokens"` means the
   * text is cut off mid-way — parsing it as JSON will fail, and the caller has to say so
   * rather than blame the model's formatting.
   */
  stoppedEarlyBecause: string | null;
  /**
   * The provider's own sentence about a failure, or null when it offered none.
   *
   * A `response.failed` event carries the reason the call died — "input tokens exceed the
   * model's context length", "file exceeds the maximum of 100 pages" — and this used to be
   * discarded at the point of arrival, leaving `"failed"` as the only trace. The route then
   * logged its own generic message, so the one explanation of the failure existed nowhere:
   * not in the response, and not in the server log either.
   *
   * Internal by default. Routes log it, and pass it to `describeModelFailure` to decide
   * whether it names something the learner can act on.
   */
  failureDetail: string | null;
  /**
   * What the call actually consumed, or null when the provider reported nothing.
   *
   * Read from the stream rather than estimated, because the usage meter shown to the
   * learner has to reflect the real call — an estimate would drift from the bill it claims
   * to represent. A gateway that omits usage yields null, and the meter skips that call
   * instead of inventing a number.
   */
  usage: ResponseUsage | null;
};

export async function collectResponse(
  events: AsyncIterable<ResponseDeltaEvent>,
): Promise<CollectedResponse> {
  let text = "";
  let stoppedEarlyBecause: string | null = null;
  let failureDetail: string | null = null;
  let usage: ResponseUsage | null = null;
  for await (const event of events) {
    if (event.type === "response.output_text.delta" && event.delta) {
      text += event.delta;
    }
    if (event.type === "response.incomplete") {
      stoppedEarlyBecause = event.response?.incomplete_details?.reason || "incomplete";
    }
    if (event.type === "response.failed") {
      const failure = event.response?.error;
      // The error code is a better reason than the bare word "failed", and the routes that
      // already log `stoppedEarlyBecause` gain it without changing: every caller either
      // compares against "max_output_tokens" or only tests the field for truth.
      stoppedEarlyBecause = failure?.code || "failed";
      failureDetail = [failure?.code, failure?.message].filter(Boolean).join(": ") || null;
    }
    // Reported on the terminal event. A cut-off response still consumed tokens, so usage is
    // taken from whichever terminal event arrives rather than only from a clean completion.
    const reported = event.response?.usage;
    if (reported) {
      const inputTokens = Number(reported.input_tokens ?? 0);
      const outputTokens = Number(reported.output_tokens ?? 0);
      if (Number.isFinite(inputTokens) && Number.isFinite(outputTokens))
        usage = { inputTokens, outputTokens };
    }
  }
  return { text, stoppedEarlyBecause, failureDetail, usage };
}

export async function collectResponseText(
  events: AsyncIterable<ResponseDeltaEvent>,
): Promise<string> {
  return (await collectResponse(events)).text;
}
