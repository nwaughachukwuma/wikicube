"use client";

import { useState, useRef, useEffect } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { XIcon, MessageSquareMore } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  wikiId: string;
  /** Current page title + summary passed as extra context to the model */
  pageContext?: string;
}

export default function ChatPanel({ wikiId, pageContext }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const question = input.trim();
    setInput("");

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: question },
    ];
    setMessages(newMessages);
    setIsStreaming(true);
    setIsThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wikiId,
          question,
          history: newMessages.slice(-10),
          pageContext,
        }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

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
          content: "Sorry, I couldn't process that question. Please try again.",
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-text text-bg
                   flex items-center justify-center shadow-lg
                   hover:bg-accent hover:text-text transition"
        aria-label="Toggle Q&A chat"
      >
        {isOpen ? (
          <XIcon className="w-5 h-5" />
        ) : (
          <MessageSquareMore className="w-5 h-5" />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-6 z-50 w-96 max-w-[calc(100vw-2rem)]
                      bg-card border-2 border-border-strong shadow-xl
                      flex flex-col"
          style={{ height: "min(500px, calc(100vh - 8rem))" }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <div className="font-display text-sm uppercase">Ask WikiCube</div>
              <div className="text-[10px] text-text-muted">
                AI-powered Q&A about this codebase
              </div>
            </div>

            <button
              className="text-[10px] rounded-full p-2 transition-opacity text-text-muted hover:text-text bg-neutral-900/10 hover:bg-neutral-900/20 uppercase tracking-wider"
              onClick={() => setIsOpen(false)}
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                className={`${
                  msg.role === "user" ? "text-right" : "text-left"
                }`}
              >
                {msg.role === "user" ? (
                  <div className="mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted">
                      You
                    </span>
                  </div>
                ) : (
                  <div className="mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted">
                      WikiCube
                    </span>
                  </div>
                )}
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

            {/* Thinking indicator */}
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

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-border flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={isStreaming}
              className="flex-1 px-3 py-2 border border-border text-sm bg-transparent
                         focus:outline-none focus:border-border-strong
                         placeholder:text-text-muted/50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="px-3 py-2 bg-text text-bg text-sm font-display uppercase
                         hover:bg-accent hover:text-text transition
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStreaming ? "..." : "Ask"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
