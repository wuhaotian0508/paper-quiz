/** Token counts the Responses API reports once a response finishes. */
export type ResponseUsage = { inputTokens: number; outputTokens: number };

export type ResponseDeltaEvent = {
  type?: string;
  delta?: string;
  response?: {
    status?: string | null;
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
  let usage: ResponseUsage | null = null;
  for await (const event of events) {
    if (event.type === "response.output_text.delta" && event.delta) {
      text += event.delta;
    }
    if (event.type === "response.incomplete") {
      stoppedEarlyBecause = event.response?.incomplete_details?.reason || "incomplete";
    }
    if (event.type === "response.failed") {
      stoppedEarlyBecause = "failed";
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
  return { text, stoppedEarlyBecause, usage };
}

export async function collectResponseText(
  events: AsyncIterable<ResponseDeltaEvent>,
): Promise<string> {
  return (await collectResponse(events)).text;
}
