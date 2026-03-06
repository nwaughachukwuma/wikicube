import { GoogleGenAI } from "@google/genai";

export const MODEL = "gemini-3.1-flash-lite-preview";
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
