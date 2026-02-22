import OpenAI from "openai";

export const MODEL = "gpt-5-nano";

let _client: OpenAI | null = null;
export function getOpenAI() {
  return (_client ||= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }));
}
