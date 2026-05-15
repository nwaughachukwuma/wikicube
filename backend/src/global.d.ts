declare namespace NodeJS {
  export interface ProcessEnv {
    SUPABASE_SECRET_KEY: string;
    SUPABASE_URL: string;
    SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
    GITHUB_TOKEN: string;
    GEMINI_API_KEY: string;
  }
}
