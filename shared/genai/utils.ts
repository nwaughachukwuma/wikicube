import OpenAI from "openai";
import { z } from "zod";
import { makeRetriable, type Options } from "p-retry";

export const MODELS = {
  "g31flash-lite": "google/gemini-3.1-flash-lite",
  g3flash: "google/gemini-3-flash-preview",
  g31pro: "google/gemini-3.1-pro-preview",
  g35flash: "google/gemini-3.5-flash",
} as const;

export type TaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "QUESTION_ANSWERING";

let _client: OpenAI | null = null;

export function getClient() {
  if (!_client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY environment variable");
    }
    _client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });
  }
  return _client;
}

export type GenerateContentResponse = { text: string };

type GenerateContentParams = {
  model: string;
  contents: string;
  config?: {
    systemInstruction?: string;
    responseJsonSchema?: Record<string, unknown>;
  };
};

export async function generateContent(
  params: GenerateContentParams,
): Promise<GenerateContentResponse> {
  const client = getClient();
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (params.config?.systemInstruction) {
    messages.push({ role: "system", content: params.config.systemInstruction });
  }
  messages.push({ role: "user", content: params.contents });

  const responseFormat = params.config?.responseJsonSchema
    ? {
        type: "json_schema" as const,
        json_schema: {
          name: "Response",
          schema: params.config.responseJsonSchema,
          strict: false,
        },
      }
    : undefined;

  const completion = await client.chat.completions.create({
    model: params.model,
    messages,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return { text };
}

export const retryGenerateContent = (opt: Options) =>
  makeRetriable(generateContent, opt);

export function parseJsonResponse<T>(
  text: string | undefined,
  source: string,
): T {
  if (!text) {
    throw new Error(`No response text from model for ${source}`);
  }

  const trimmed = text.trim();
  const normalized = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  return JSON.parse(normalized) as T;
}

export function toJsonSchema(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  return jsonSchema;
}

export function parseStructuredJson<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  text: string | undefined,
  source: string,
): z.infer<TSchema> {
  return schema.parse(parseJsonResponse<unknown>(text, source));
}
