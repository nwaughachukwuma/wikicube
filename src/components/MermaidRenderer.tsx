"use client";

import { useEffect, useId, useState } from "react";

interface MermaidRendererProps {
  chart: string;
}

export default function MermaidRenderer({ chart }: MermaidRendererProps) {
  const baseId = useId().replace(/:/g, "-");
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    const renderDiagram = async () => {
      try {
        const { default: mermaid } = await import(
          /* webpackIgnore: true */
          "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"
        );
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
        });
        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${baseId}`,
          chart,
        );
        setSvg(renderedSvg);
      } catch {
        setSvg("");
        document.querySelectorAll(`[id^="mermaid-${baseId}"]`).forEach((el) => el.remove());
      }
    };

    void renderDiagram();
  }, [chart, baseId]);

  if (!svg) {
    return (
      <pre className="overflow-x-auto">
        <code className="language-mermaid">{chart}</code>
      </pre>
    );
  }

  return (
    <div
      className="mermaid-block my-6 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
