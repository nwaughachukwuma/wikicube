/* ─── RAG: Chat with wiki ─── */

import { makeRetriable } from "p-retry";
import type OpenAI from "openai";
import { getClient, MODELS } from "./utils";
import { logger } from "../logger";

const log = logger("openrouter:chatWithWiki");

export async function chatWithWiki(
  question: string,
  contextChunks: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ReadableStream<Uint8Array>> {
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
    ...history.map<OpenAI.ChatCompletionMessageParam>((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];

  const chatStream = async (question: string) =>
    getClient().chat.completions.create({
      model: MODELS["g31flash-lite"],
      messages: [...messages, { role: "user", content: question }],
      stream: true,
    });

  const retryChat = makeRetriable(chatStream, {
    retries: 3,
    onFailedAttempt(ctx) {
      log.warn(
        `Chat with Wiki stream ${ctx.attemptNumber} failed. ` +
          `There are ${ctx.retriesLeft} retries left. Error: ${ctx.error}`,
      );
    },
  });

  const res = await retryChat(question);
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
