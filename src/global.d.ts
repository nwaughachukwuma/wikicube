declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: "development" | "production";
    NEXT_SUPABASE_SECRET_KEY: string;
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
    GITHUB_TOKEN: string;
    OPENROUTER_API_KEY: string;
    BACKEND_BASE_URL: string;
  }
}

declare module "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs" {
  interface MermaidConfig {
    startOnLoad?: boolean;
    theme?: string;
    securityLevel?: "strict" | "loose" | "antiscript" | "sandbox";
  }
  interface RenderResult {
    svg: string;
    bindFunctions?: (element: HTMLElement) => void;
  }
  const mermaid: {
    initialize: (config: MermaidConfig) => void;
    render: (id: string, text: string) => Promise<RenderResult>;
  };
  export default mermaid;
}
