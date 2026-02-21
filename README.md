# WikiGen — Instant Wiki for Any GitHub Repo

Paste a GitHub URL and get a polished, AI-generated wiki organized by user-facing features. One click. Zero setup.

## Features

- **Repository Analyzer** — Identifies high-level user-facing features (not technical layers) from any public GitHub repo
- **Wiki Generator** — Creates comprehensive wiki pages with inline citations linking to exact GitHub file/line
- **Semantic Search** — Search across the wiki using natural language, powered by Supabase pgvector
- **Q&A Chat** — Ask questions about the codebase and get AI-powered answers with source citations
- **Bold Editorial Design** — Clean, light-mode UI inspired by the Bold Editorial style system

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **AI**: OpenAI gpt-5-mini + text-embedding-3-small (1536 dims)
- **Database**: Supabase (PostgreSQL + pgvector)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (free tier works)
- OpenAI API key

### Setup

1. Clone the repo:

   ```bash
   git clone https://github.com/nwaughachukwuma/cubic-wiki.git
   cd cubic-wiki
   npm install
   ```

2. Set up environment variables:

   ```bash
   cp .env.local.example .env.local
   # Fill in your keys
   ```

3. Run the Supabase migration:
   - Go to your Supabase dashboard → SQL Editor
   - Paste and run `supabase/migration.sql`

4. Start the dev server:
   ```bash
   npm run dev
   ```

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/    # SSE endpoint: runs full analysis pipeline
│   │   ├── chat/       # Streaming Q&A with RAG context
│   │   ├── search/     # Semantic search via embeddings
│   │   └── wiki/       # Fetch wiki data
│   ├── wiki/[owner]/[repo]/  # Wiki pages
│   └── page.tsx        # Landing page
├── components/
│   ├── AnalysisProgress.tsx  # SSE progress UI
│   ├── ChatPanel.tsx         # Floating Q&A chat
│   ├── MarkdownRenderer.tsx  # Wiki content renderer
│   ├── SearchBar.tsx         # Semantic search input
│   ├── TableOfContents.tsx   # Auto-generated ToC
│   ├── WikiShell.tsx         # Wiki layout wrapper
│   └── WikiSidebar.tsx       # Feature navigation
└── lib/
    ├── analyzer.ts   # Full analysis pipeline
    ├── db.ts         # Supabase CRUD operations
    ├── github.ts     # GitHub API client
    ├── openai.ts     # LLM calls + embeddings
    ├── supabase.ts   # Client initialization
    └── types.ts      # TypeScript types
```

## Analysis Pipeline

1. **Context Gathering** — Fetch file tree, README, manifests (tree is paths-only, fits any repo size)
2. **Feature Identification** — LLM identifies all user-facing features from the tree + README
3. **Targeted File Fetching** — Per-feature file fetch with budget (30 files, 300 lines each)
4. **Page Generation** — Parallel LLM calls generate wiki pages with inline citations
5. **Overview Generation** — Synthesize all features into an overview page
6. **Embedding** — Chunk all content, embed with text-embedding-3-small, store in pgvector
