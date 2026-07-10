declare namespace NodeJS {
  export interface ProcessEnv {
    SUPABASE_SECRET_KEY: string;
    SUPABASE_URL: string;
    SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
    GITHUB_TOKEN: string;
    OPENROUTER_API_KEY: string;
    REDIS_PASSWORD: string;
  }
}
