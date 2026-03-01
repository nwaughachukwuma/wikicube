"use client";

import { useRef, useEffect } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isStreaming: boolean;
  autoFocus?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isStreaming,
  autoFocus,
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <form
      onSubmit={onSubmit}
      className="p-3 border-t border-border flex gap-2 shrink-0"
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ask a question..."
        disabled={isStreaming}
        className="flex-1 px-3 py-2 border border-border text-sm bg-transparent
                   focus:outline-none focus:border-border-strong
                   placeholder:text-text-muted/50 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isStreaming || !value.trim()}
        className="px-3 py-2 bg-text text-bg text-sm font-display uppercase
                   hover:bg-accent hover:text-text transition
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isStreaming ? "..." : "Ask"}
      </button>
    </form>
  );
}
