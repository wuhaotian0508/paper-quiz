export type ResponseDeltaEvent = {
  type?: string;
  delta?: string;
  response?: {
    status?: string | null;
    incomplete_details?: { reason?: string | null } | null;
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
};

export async function collectResponse(
  events: AsyncIterable<ResponseDeltaEvent>,
): Promise<CollectedResponse> {
  let text = "";
  let stoppedEarlyBecause: string | null = null;
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
  }
  return { text, stoppedEarlyBecause };
}

export async function collectResponseText(
  events: AsyncIterable<ResponseDeltaEvent>,
): Promise<string> {
  return (await collectResponse(events)).text;
}
