export function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="w-full">
      <div className="p-4 border-2 border-red-400 bg-red-50 text-red-800 text-sm">
        <p className="font-medium">Analysis failed</p>
        <p className="mt-1">{error}</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 border-2 border-border-strong text-sm font-display uppercase hover:bg-accent hover:border-accent transition"
      >
        Retry
      </button>
    </div>
  );
}
