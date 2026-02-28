"use client";

import { useState, useEffect, useCallback } from "react";
import { XIcon, MessageSquareMore } from "lucide-react";
import { useUser } from "@/lib/supabase/useUser";
import { getBrowserClient } from "@/lib/supabase/client";
import { useChatSession } from "./chat-panel/useChatSession";
import { useChatStream } from "./chat-panel/useChatStream";
import { ChatHeader } from "./chat-panel/ChatHeader";
import { ChatAuthGate } from "./chat-panel/ChatAuthGate";
import { ChatSessionsList } from "./chat-panel/ChatSessionsList";
import { ChatMessages } from "./chat-panel/ChatMessages";
import { ChatInput } from "./chat-panel/ChatInput";
import type { ChatPanelProps } from "./chat-panel/types";

export default function ChatPanel({ wikiId, pageContext }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"sessions" | "chat" | null>(null);
  const { user, authLoading } = useUser();

  const {
    sessionIdRef,
    sessions,
    loadingSessions,
    fetchSessions,
    loadSession,
    startNewSession,
  } = useChatSession({ wikiId });

  const getSessionId = useCallback(() => sessionIdRef.current, [sessionIdRef]);

  const {
    messages,
    setMessages,
    input,
    setInput,
    isStreaming,
    isThinking,
    handleSubmit,
  } = useChatStream({ wikiId, pageContext, getSessionId });

  const signIn = () => {
    getBrowserClient().auth.signInWithOAuth({
      provider: "github",
      options: {
        scopes: "repo read:user",
        redirectTo: `${window.location.origin}/api/auth/callback?next=${window.location.pathname}`,
      },
    });
  };

  useEffect(() => {
    if (!isOpen || !user) return;
    if (messages.length > 0) return setView("chat");
    fetchSessions().then((loaded) => {
      setView(loaded.length > 0 ? "sessions" : "chat");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user]);

  const handleNewSession = useCallback(() => {
    startNewSession();
    setMessages([]);
    setView("chat");
  }, [startNewSession, setMessages]);

  const handleLoadSession = useCallback(
    async (sessionId: string) => {
      const loaded = await loadSession(sessionId);
      if (loaded) {
        setMessages(loaded);
        setView("chat");
      }
    },
    [loadSession, setMessages],
  );

  const handleBackToSessions = useCallback(() => {
    fetchSessions();
    setView("sessions");
  }, [fetchSessions]);

  return (
    <>
      {/* Toggle button */}
      <button
        aria-label="Toggle Q&A chat"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-text text-bg
                   flex items-center justify-center shadow-lg
                   hover:bg-accent hover:text-text transition"
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
                      bg-card border-2 border-border-strong shadow-xl flex flex-col"
          style={{ height: "min(520px, calc(100vh - 8rem))" }}
        >
          <ChatHeader
            view={view}
            hasSessions={sessions.length > 0}
            onClose={() => setIsOpen(false)}
            onNewSession={handleNewSession}
            onBackToSessions={handleBackToSessions}
          />

          {authLoading || loadingSessions ? (
            <div className="flex-1 overflow-y-auto p-6 text-center text-text-muted text-sm">
              Loading…
            </div>
          ) : !user ? (
            <ChatAuthGate onSignIn={signIn} />
          ) : (
            view && (
              <>
                {view === "sessions" ? (
                  <ChatSessionsList
                    sessions={sessions}
                    onSelectSession={handleLoadSession}
                  />
                ) : (
                  view === "chat" && (
                    <>
                      <ChatMessages
                        messages={messages}
                        isThinking={isThinking}
                        isStreaming={isStreaming}
                      />
                      <ChatInput
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                        isStreaming={isStreaming}
                        autoFocus={isOpen}
                      />
                    </>
                  )
                )}
              </>
            )
          )}
        </div>
      )}
    </>
  );
}
