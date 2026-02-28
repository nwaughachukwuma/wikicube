"use client";

interface ChatAuthGateProps {
  onSignIn: () => void;
}

export function ChatAuthGate({ onSignIn }: ChatAuthGateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
      <p className="text-sm text-text-muted">Log in to chat with this wiki</p>
      <button
        onClick={onSignIn}
        className="px-4 py-2 bg-text text-bg text-sm font-display uppercase
                   hover:bg-accent hover:text-text transition"
      >
        Log in with GitHub
      </button>
    </div>
  );
}
