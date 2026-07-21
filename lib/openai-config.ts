type OpenAIEnv = Partial<Pick<NodeJS.ProcessEnv, "OPENAI_API_KEY" | "OPENAI_BASE_URL">>;

export function getOpenAIClientOptions(env: OpenAIEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
}) {
  if (!env.OPENAI_API_KEY) return null;

  return {
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
  };
}
