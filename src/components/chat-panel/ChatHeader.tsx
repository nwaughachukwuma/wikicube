"use client";

import { XIcon, Plus, ChevronLeft } from "lucide-react";

interface ChatHeaderProps {
  view: "sessions" | "chat" | null;
  hasSessions: boolean;
  onClose: () => void;
  onNewSession: () => void;
  onBackToSessions: () => void;
}

export function ChatHeader({
  view,
  hasSessions,
  onClose,
  onNewSession,
  onBackToSessions,
}: ChatHeaderProps) {
  const actionButtons = (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={onNewSession}
        className="p-1.5 hover:bg-neutral-900/10 transition text-text-muted hover:text-text"
        aria-label="New session"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        onClick={onClose}
        className="p-1.5 hover:bg-neutral-900/10 transition text-text-muted hover:text-text"
        aria-label="Close"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
      {view === "sessions" ? (
        <>
          <div className="font-display text-sm uppercase">Chat History</div>
          {actionButtons}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 min-w-0">
            {hasSessions && (
              <button
                onClick={onBackToSessions}
                className="p-1 hover:bg-neutral-900/10 transition text-text-muted hover:text-text shrink-0"
                aria-label="Back to sessions"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="font-display text-sm uppercase">Ask WikiCube</div>
              <div className="text-[10px] text-text-muted">
                AI-powered Q&A about this codebase
              </div>
            </div>
          </div>
          {actionButtons}
        </>
      )}
    </div>
  );
}
