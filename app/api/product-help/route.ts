import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClientOptions, getOpenAIModel } from "@/lib/openai-config";
import {
  buildProductHelpInstructions,
  parseProductHelpReply,
  ProductHelpReplySchema,
  ProductHelpRequestSchema,
} from "@/lib/product-help";

export const maxDuration = 60;

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error("Please enter a valid product-help question.", 400);
    }
    const parsed = ProductHelpRequestSchema.safeParse(body);
    if (!parsed.success) return error("Please enter a valid product-help question.", 400);

    const options = getOpenAIClientOptions();
    if (!options) return error("The server has not been configured with an OpenAI API key.", 503);

    const response = await new OpenAI(options).responses.create({
      model: getOpenAIModel(),
      max_output_tokens: 700,
      input: [
        { role: "developer", content: buildProductHelpInstructions() },
        ...parsed.data.history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        {
          role: "user",
          content: `Current screen: ${parsed.data.currentView}\nQuestion: ${parsed.data.message}`,
        },
      ],
      text: { format: zodTextFormat(ProductHelpReplySchema, "product_help_reply") },
    });
    const reply = parseProductHelpReply(response.output_text);
    if (!reply)
      return error("The help chatbot did not return a usable answer. Please try again.", 502);

    return Response.json(reply);
  } catch (cause) {
    if (cause instanceof OpenAI.APIError) {
      console.error("Product help provider failed", {
        status: cause.status,
        code: cause.code,
        type: cause.type,
      });
    } else {
      console.error(
        "Product help failed",
        cause instanceof Error ? cause.message : "unknown error",
      );
    }
    return error("Product help failed. Please try again later.", 502);
  }
}
