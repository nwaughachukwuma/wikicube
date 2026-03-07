import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { makeRetriable, type Options } from "p-retry";

export const MODELS = {
  "g31flash-lite": "gemini-3.1-flash-lite-preview",
  g3flash: "gemini-3-flash-preview",
  g31pro: "gemini-3.1-pro-preview",
} as const;

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 1536;

export type TaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "QUESTION_ANSWERING";

let _client: GoogleGenAI | null = null;

export function getGemini() {
  return (_client ||= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  }));
}

export function parseJsonResponse<T>(
  text: string | undefined,
  source: string,
): T {
  if (!text) {
    throw new Error(`No response text from Gemini for ${source}`);
  }

  const trimmed = text.trim();
  const normalized = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  return JSON.parse(normalized) as T;
}

export function toGeminiJsonSchema(schema: z.ZodTypeAny) {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: "none",
  }) as Record<string, unknown>;

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

export const retryGenerateContent = (opt: Options) =>
  makeRetriable(getGemini().models.generateContent, {
    retries: opt.retries,
    onFailedAttempt: opt.onFailedAttempt,
  });
