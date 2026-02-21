"use client";

import { useMemo } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface Props {
  content: string;
}

export default function TableOfContents({ content }: Props) {
  const headings = useMemo(() => {
    const items: TocItem[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const match = line.match(/^(#{2,3})\s+(.+)/);
      if (match) {
        const level = match[1].length;
        const text = match[2].replace(/\*\*/g, "").replace(/`/g, "").trim();
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        items.push({ id, text, level });
      }
    }
    return items;
  }, [content]);

  if (headings.length === 0) return null;

  return (
    <nav>
      <div className="text-[10px] uppercase tracking-widest text-text-muted mb-3">
        On this page
      </div>
      <div className="space-y-1">
        {headings.map((h, i) => (
          <a
            key={i}
            href={`#${h.id}`}
            className={`block text-xs text-text-muted hover:text-text transition
                        ${h.level === 3 ? "pl-3" : ""}`}
          >
            {h.text}
          </a>
        ))}
      </div>
    </nav>
  );
}
