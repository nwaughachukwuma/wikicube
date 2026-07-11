"use client";

import { isValidElement, type ReactNode } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

const MermaidRenderer = dynamic(() => import("./MermaidRenderer"), {
  ssr: false,
});

interface Props {
  content: string;
}

interface CodeElementProps {
  className?: string;
  children?: ReactNode;
}

function getText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getText(node.props.children);
  }
  return "";
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <div className="wiki-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children, ...props }) => {
            const isGitHub = href?.includes("github.com");
            return (
              <a
                href={href}
                target={isGitHub ? "_blank" : undefined}
                rel={isGitHub ? "noopener noreferrer" : undefined}
                className={isGitHub ? "citation-link" : undefined}
                {...props}
              >
                {children}
                {isGitHub && (
                  <svg
                    className="inline w-3 h-3 ml-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                )}
              </a>
            );
          },
          pre: ({ children }) => {
            if (
              isValidElement<CodeElementProps>(children) &&
              children.props.className?.includes("language-mermaid")
            ) {
              const chart = getText(children.props.children);
              if (chart) return <MermaidRenderer chart={chart} />;
            }
            return <pre className="overflow-x-auto">{children}</pre>;
          },
          code: ({ className, children, ...props }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="bg-code-bg px-1.5 py-0.5 text-sm font-mono rounded-sm"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
