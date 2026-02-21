declare namespace NodeJS {
  export interface ProcessEnv {
    NODE_ENV: "development" | "production";
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
    GITHUB_TOKEN: string;
    OPENAI_API_KEY: string;
  }
}
