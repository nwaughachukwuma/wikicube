import { useState } from "react";
import { Loader2 } from "lucide-react";
import { HttpError } from "@shared/error";
import { toast } from "sonner";

type Props = {
  owner: string;
  repo: string;
};

export const SearchReindexButton = ({ owner, repo }: Props) => {
  const [reindexing, setReindexing] = useState(false);

  const handleReindex = async () => {
    if (reindexing) return;
    setReindexing(true);

    return await fetch("/api/reindex", {
      method: "POST",
      body: JSON.stringify({ owner, repo }),
      headers: { "Content-Type": "application/json" },
    })
      .then(async (res) => {
        if (res.ok) return res.json();
        const orignalError = `GitHub API error ${res.status}: ${await res.text()}`;
        throw new HttpError(res, orignalError);
      })
      .then(() => window.location.reload())
      .catch((err) => {
        toast.error("Re-indexing failed", {
          description: err.message,
        });
      })
      .finally(() => setReindexing(false));
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
