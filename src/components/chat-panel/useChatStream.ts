"use client";

import { useState, useCallback } from "react";
import type { Message } from "./types";

interface UseChatStreamOptions {
  wikiId: string;
  pageContext?: string;
  getSessionId: () => string;
}

export function useChatStream({
  wikiId,
  pageContext,
  getSessionId,
}: UseChatStreamOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || isStreaming) return;

      setMessages((prev) => [...prev, { role: "user", content: question }]);
      setIsStreaming(true);
      setIsThinking(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wikiId,
            sessionId: getSessionId(),
            question,
            pageContext,
          }),
        });

        if (!res.ok) throw new Error("Chat request failed");

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let assistantContent = "";
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistantContent += decoder.decode(value, { stream: true });
          setIsThinking(false);
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantContent,
            };
            return updated;
          });
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I couldn't process that question. Please try again.",
          },
        ]);
      } finally {
        setIsStreaming(false);
        setIsThinking(false);
      }
    },
    [wikiId, pageContext, getSessionId, isStreaming],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const question = input.trim();
      if (!question) return;
      setInput("");
      sendMessage(question);
    },
    [input, sendMessage],
  );

  return {
    messages,
    setMessages,
    input,
    setInput,
    isStreaming,
    isThinking,
    handleSubmit,
  };
}
