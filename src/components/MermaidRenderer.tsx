"use client";

import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

let mermaidInitialized = false;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
  });
  mermaidInitialized = true;
}

interface MermaidRendererProps {
  chart: string;
}

export default function MermaidRenderer({ chart }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseId = useId().replace(/:/g, "-");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initMermaid();

    const renderDiagram = async () => {
      try {
        const { svg: renderedSvg, bindFunctions } = await mermaid.render(
          `mermaid-${baseId}`,
          chart,
        );
        setSvg(renderedSvg);
        setError(null);

        if (containerRef.current && bindFunctions) {
          bindFunctions(containerRef.current);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to render diagram",
        );
      }
    };

    void renderDiagram();
  }, [chart, baseId]);

  if (error) {
    return (
      <div className="my-6 rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-semibold">Could not render diagram</p>
        <pre className="mt-2 overflow-x-auto text-xs font-mono text-red-600">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-block my-6 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
