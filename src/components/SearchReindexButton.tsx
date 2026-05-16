import { useState } from "react";
import { Loader2 } from "lucide-react";

type Props = {
  owner: string;
  repo: string;
};

export const SearchReindexButton = ({ owner, repo }: Props) => {
  const [reindexing, setReindexing] = useState(false);

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch("/api/reindex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed" }));
        console.error("Reindex failed:", error);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "done" || evt.type === "error") {
                window.location.reload();
                return;
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error("Reindex error:", err);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <button
      onClick={handleReindex}
      disabled={reindexing}
      className="mt-1 text-sm flex justify-center p-1.5 hover:bg-accent-hover transition-all hover:text-black w-full bg-gray-700 cursor-pointer text-accent disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {reindexing ? (
        <Loader2
          className="animate-spin w-4 h-4"
          style={{ animation: "spin 0.3s linear infinite" }}
        />
      ) : (
        "Re-index"
      )}
    </button>
  );
};
