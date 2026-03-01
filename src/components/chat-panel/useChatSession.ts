"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatSession, Message } from "./types";

interface UseChatSessionOptions {
  wikiId: string;
}

export function useChatSession({ wikiId }: UseChatSessionOptions) {
  const sessionIdRef = useRef<string>("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Session ID: stable across SPA navigation, reset on page refresh (sessionStorage)
  useEffect(() => {
    const key = `chat-session-${wikiId}`;
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    sessionIdRef.current = id;
  }, [wikiId]);

  const fetchSessions = useCallback(async (): Promise<ChatSession[]> => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/chat/sessions?wikiId=${wikiId}`);
      if (res.ok) {
        const data: ChatSession[] = await res.json();
        setSessions(data);
        return data;
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingSessions(false);
    }
    return [];
  }, [wikiId]);

  const loadSession = useCallback(
    async (sessionId: string): Promise<Message[] | null> => {
      try {
        const res = await fetch(
          `/api/chat/sessions?wikiId=${wikiId}&sessionId=${sessionId}`,
        );
        if (!res.ok) return null;

        const rows: Array<{ role: "user" | "assistant"; content: string }> =
          await res.json();

        sessionIdRef.current = sessionId;
        sessionStorage.setItem(`chat-session-${wikiId}`, sessionId);
        return rows.map((r) => ({ role: r.role, content: r.content }));
      } catch {
        return null;
      }
    },
    [wikiId],
  );

  const startNewSession = useCallback((): string => {
    const id = crypto.randomUUID();
    sessionIdRef.current = id;
    sessionStorage.setItem(`chat-session-${wikiId}`, id);
    return id;
  }, [wikiId]);

  return {
    sessionIdRef,
    sessions,
    loadingSessions,
    fetchSessions,
    loadSession,
    startNewSession,
  };
}
