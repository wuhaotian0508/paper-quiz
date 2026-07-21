export type ResponseDeltaEvent = {
  type?: string;
  delta?: string;
};

export async function collectResponseText(
  events: AsyncIterable<ResponseDeltaEvent>,
): Promise<string> {
  let text = "";
  for await (const event of events) {
    if (event.type === "response.output_text.delta" && event.delta) {
      text += event.delta;
    }
  }
  return text;
}
