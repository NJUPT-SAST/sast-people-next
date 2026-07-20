import "server-only";

type GenerateTextInput = {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
};

type OpenAIResponseOutputText = {
  type?: string;
  text?: string;
};

type OpenAIResponseOutputContent = {
  content?: OpenAIResponseOutputText[];
};

type OpenAIResponseBody = {
  output_text?: string;
  output?: OpenAIResponseOutputContent[];
  error?: {
    message?: string;
  };
};

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AiConfigurationError("AI 功能未配置 OPENAI_API_KEY");
  }

  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseOpenAIResponse(value: unknown): OpenAIResponseBody {
  if (!isRecord(value)) return {};

  const outputText =
    typeof value.output_text === "string" ? value.output_text : undefined;
  const error =
    isRecord(value.error) && typeof value.error.message === "string"
      ? { message: value.error.message }
      : undefined;
  const output = Array.isArray(value.output)
    ? value.output
        .filter(isRecord)
        .map((item) => ({
          content: Array.isArray(item.content)
            ? item.content.filter(isRecord).map((content) => ({
                type: typeof content.type === "string" ? content.type : undefined,
                text: typeof content.text === "string" ? content.text : undefined,
              }))
            : undefined,
        }))
    : undefined;

  return { output_text: outputText, output, error };
}

function getGeneratedText(body: OpenAIResponseBody) {
  if (body.output_text?.trim()) {
    return body.output_text.trim();
  }

  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n")
    .trim();

  return text ?? "";
}

export async function generateTextWithOpenAI({
  instructions,
  input,
  maxOutputTokens = 700,
}: GenerateTextInput) {
  const { apiKey, baseUrl, model } = getOpenAIConfig();
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
    }),
  });

  const body = parseOpenAIResponse(await response.json().catch(() => null));

  if (!response.ok) {
    throw new Error(body.error?.message ?? "AI 服务调用失败");
  }

  const text = getGeneratedText(body);
  if (!text) {
    throw new Error("AI 服务未返回可用内容");
  }

  return text;
}
