/* ─── RAG: Chat with wiki ─── */

import OpenAI from "openai";
import { getOpenAI, MODEL } from "./utils";

export async function chatWithWiki(
  question: string,
  contextChunks: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ReadableStream<Uint8Array>> {
  const openai = getOpenAI();

  const context = contextChunks.join("\n\n---\n\n");

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a helpful assistant answering questions about a codebase wiki.

      Use ONLY the provided context to answer. If the context doesn't contain enough information, say so honestly.
      Cite specific features, files, and line numbers when possible.
      Be concise and accurate.

      Context from the wiki and codebase:
      ${context}`,
    },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: question },
  ];

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of res) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
      controller.close();
    },
  });
}
