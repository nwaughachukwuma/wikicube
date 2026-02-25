# WikiCube — Instant Wiki for Any GitHub Repo

<img width="1510" height="505" alt="Gemini_Generated_Image_7imigd7imigd7imi" src="https://github.com/user-attachments/assets/97bcdb79-59d9-4b88-917e-70a8e43f28c2" />

Paste a GitHub URL and get a polished, AI-generated wiki organized by user-facing features. One click. Zero setup.

> https://wikicube.vercel.app

## Features

- **Repository Analyzer** — Identifies high-level user-facing features (not technical layers) from any public GitHub repo
- **Wiki Generator** — Creates comprehensive wiki pages with inline citations linking to exact GitHub file/line
- **Semantic Search** — Search across the wiki using natural language, powered by Supabase pgvector
- **Q&A Chat** — Ask questions about the codebase and get AI-powered answers with source citations
- **Wiki History** — Browse previously generated wikis grouped by recency (today, this week, etc.)
- **Bold Editorial Design** — Clean, light-mode UI with warm off-white, deep charcoal, and golden-yellow accents

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **AI**: OpenAI `gpt-5-mini` + `text-embedding-3-small` (1536 dims)
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

5. (Optional) Pre-generate example wikis locally against Supabase:
   ```bash
   npm run pregenerate
   ```

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/        # SSE endpoint: runs full analysis pipeline
│   │   ├── chat/           # Streaming Q&A with RAG context
│   │   ├── search/         # Semantic search via embeddings
│   │   ├── wiki/[owner]/[repo]/  # Fetch wiki + feature data
│   │   └── wikis/          # List all completed wikis
│   ├── wiki/[owner]/[repo]/
│   │   ├── layout.tsx      # WikiShell wrapper (sidebar + ToC)
│   │   ├── page.tsx        # Repo overview page
│   │   └── [featureSlug]/
│   │       └── page.tsx    # Individual feature wiki page
│   └── page.tsx            # Landing page
├── components/
│   ├── AnalysisProgress.tsx    # SSE progress UI
│   ├── ChatPanel.tsx           # Floating Q&A chat panel
│   ├── MarkdownRenderer.tsx    # Wiki content renderer (shiki + remark-gfm)
│   ├── OptimisticLink.tsx      # Link with optimistic navigation state
│   ├── SearchBar.tsx           # Semantic search input
│   ├── TableOfContents.tsx     # Auto-generated ToC from H2/H3 headings
│   ├── WikiHistoryPanel.tsx    # Slide-over panel of past wikis by time group
│   ├── WikiShell.tsx           # Wiki layout wrapper
│   ├── WikiSidebar.tsx         # Feature navigation sidebar
│   └── analysis-progress/     # Sub-components for the analysis progress UI
│       ├── ErrorPanel.tsx
│       ├── FeatureProgress.tsx
│       ├── ProgressSteps.tsx
│       └── types.ts
└── lib/
    ├── batchOps.ts         # Batch/concurrency helpers
    ├── cache.ts            # In-memory caching layer
    ├── chunker.ts          # Token-aware content chunking (~500 tokens)
    ├── db.ts               # Supabase CRUD + vector search RPC
    ├── error.ts            # Error extraction utilities
    ├── github.ts           # GitHub API client (tree, file fetch, URL builder)
    ├── logger.ts           # Structured logger with timers
    ├── types.ts            # Shared TypeScript types + AnalysisStatus enum
    ├── code-analyzer/      # Analysis pipeline modules
    │   ├── analyzer.ts         # Orchestrates all pipeline phases (A–F)
    │   ├── contextGatherer.ts  # Phase A: repo metadata, tree, README, manifests
    │   ├── featureIdentifier.ts # Phase B: LLM feature identification
    │   ├── pageGenerator.ts    # Phases C+D: file fetch + page generation
    │   ├── embedder.ts         # Phases E+F: overview generation + embedding
    │   └── index.ts            # Re-exports
    └── openai/             # OpenAI integration
        ├── embeddings.ts       # Batch embedding via text-embedding-3-small
        ├── generateFeatureFlag.ts # Per-feature wiki page generation
        ├── generateOverview.ts # Repo overview page generation
        ├── identifyFeatures.ts # Feature identification prompt
        ├── utils.ts            # Shared model constant (gpt-5-mini)
        ├── wikiChat.ts         # Streaming RAG chat
        └── index.ts            # Re-exports
```

## Analysis Pipeline

1. **Phase A — Context Gathering** — Fetch repo metadata, filtered file tree (paths only), README, and manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.)
2. **Phase B — Feature Identification** — LLM identifies all user-facing features from the tree + README + manifests; returns features with their relevant file paths
3. **Phase C — Targeted File Fetching** — Per-feature file fetch with a budget of 30 files / 300 lines each, prioritising entry points; keeps context under ~40k tokens
4. **Phase D — Page Generation** — Parallel LLM calls (concurrency 3) generate wiki pages with inline GitHub citations; all run inside `Promise.allSettled()`
5. **Phase E — Overview Generation** — Synthesises all feature titles + summaries into a repo overview page with a Mermaid architecture diagram
6. **Phase F — Embedding** — Chunks all wiki content + source code into ~500-token passages, batch-embeds via `text-embedding-3-small`, stores in Supabase pgvector

Progress is streamed to the client via **SSE** throughout all phases.

## API Routes

| Method | Route                      | Description                                                                                                                             |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/analyze`             | Start analysis; returns an SSE stream with typed `AnalysisEvent` progress updates. Re-uses cached result if the wiki is already `done`. |
| `POST` | `/api/chat`                | RAG Q&A with conversation history and optional `pageContext`; streams the response.                                                     |
| `POST` | `/api/search`              | Semantic search: embeds the query, calls `match_chunks` RPC, returns ranked results.                                                    |
| `GET`  | `/api/wiki/[owner]/[repo]` | Fetch wiki + features from Supabase.                                                                                                    |
| `GET`  | `/api/wikis`               | List all completed wikis (used by the history panel).                                                                                   |

## Environment Variables

| Variable                    | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `OPENAI_API_KEY`            | OpenAI API key                                                   |
| `NEXT_PUBLIC_SUPABASE_URL`  | Supabase project URL                                             |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only)                     |
| `GITHUB_TOKEN`              | _(Optional)_ GitHub personal access token for higher rate limits |

## Database Schema

Three tables in Supabase (see `supabase/migration.sql`):

- **`wikis`** — one row per repo; tracks `status`, `overview`, timestamps
- **`features`** — one row per identified feature; stores `markdown_content`, `entry_points`, `citations`, `sort_order`
- **`chunks`** — one row per embedded passage; stores `embedding vector(1536)`, `source_file`, `source_type` (`wiki` | `code`)

Vector search uses the `match_chunks` RPC (cosine similarity via `ivfflat` index).
