"use client";

import { useRef, useEffect } from "react";
import MarkdownRenderer from "../MarkdownRenderer";
import type { Message } from "./types";

interface ChatMessagesProps {
  messages: Message[];
  isThinking: boolean;
  isStreaming: boolean;
}

export function ChatMessages({
  messages,
  isThinking,
  isStreaming,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
      {messages.length === 0 && (
        <div className="text-center text-text-muted text-sm py-8">
          <p>Ask anything about this codebase.</p>
          <p className="mt-2 text-xs">
            e.g. &ldquo;Provide a high-level summary of this repo&rdquo;
          </p>
        </div>
      )}

      {messages.map((msg, i) => (
        <div
          key={i}
          className={`overflow-hidden wrap-break-word ${msg.role === "user" ? "text-right" : "text-left"}`}
        >
          <div className="mb-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              {msg.role === "user" ? "You" : "WikiCube"}
            </span>
          </div>
          <div
            className={`inline-block max-w-[95%] text-sm ${
              msg.role === "user"
                ? "bg-text text-bg px-3 py-2 text-left"
                : "bg-bg-alt px-3 py-2"
            }`}
          >
            {msg.role === "assistant" ? (
              msg.content ? (
                <MarkdownRenderer content={msg.content} />
              ) : null
            ) : (
              msg.content
            )}
          </div>
        </div>
      ))}

      {isThinking && (
        <div className="text-left">
          <div className="inline-flex items-center gap-1.5 bg-bg-alt px-3 py-3 text-sm text-text-muted">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
