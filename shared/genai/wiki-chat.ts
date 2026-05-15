/* ─── RAG: Chat with wiki ─── */

import type { Content } from "@google/genai";
import { getGemini, MODELS } from "./utils";
import { makeRetriable } from "p-retry";
import { logger } from "../logger";

const log = logger("gemini:chatWithWiki");

export async function chatWithWiki(
  question: string,
  contextChunks: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ReadableStream<Uint8Array>> {
  const context = contextChunks.join("\n\n---\n\n");

  const chat = getGemini().chats.create({
    model: MODELS["g31flash-lite"],
    config: {
      systemInstruction: `You are a helpful assistant answering questions about a codebase wiki.

Use ONLY the provided context to answer. If the context doesn't contain enough information, say so honestly.
Cite specific features, files, and line numbers when possible.
Be concise and accurate.

Context from the wiki and codebase:
${context}`,
    },
    history: history.map<Content>((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });

  const chatStream = async (question: string) =>
    chat.sendMessageStream({ message: question });

  const retryChat = makeRetriable(chatStream, {
    retries: 3,
    onFailedAttempt(ctx) {
      log.warn(
        `Chat with Wiki sendMessageStream ${ctx.attemptNumber} failed.` +
          `There are ${ctx.retriesLeft} retries left. Error: ${ctx.error}`,
      );
    },
  });

  const res = await retryChat(question);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of res) {
        const text = chunk.text || "";
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
      controller.close();
    },
  });
}
