"use client";

import type { ChatSession } from "./types";
import { timeAgo } from "@/lib/timing";

interface ChatSessionsListProps {
  sessions: ChatSession[];
  onSelectSession: (sessionId: string) => void;
}

export function ChatSessionsList({
  sessions,
  onSelectSession,
}: ChatSessionsListProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <ul>
        {sessions.map((s) => (
          <li key={s.session_id}>
            <button
              onClick={() => onSelectSession(s.session_id)}
              className="w-full text-left px-4 py-3 border-b border-border hover:bg-bg-alt transition group"
            >
              <div className="text-sm truncate text-text group-hover:text-text">
                {s.preview}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-2">
                <span>{timeAgo(s.last_activity)}</span>
                <span>·</span>
                <span>
                  {s.message_count} message
                  {s.message_count !== 1 ? "s" : ""}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
