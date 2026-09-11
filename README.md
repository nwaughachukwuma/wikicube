# WikiCube — Instant Wiki for Any GitHub Repo

<img width="1510" height="505" alt="WikiCube hero" src="https://github.com/user-attachments/assets/97bcdb79-59d9-4b88-917e-70a8e43f28c2" />

Paste a GitHub URL and get a polished, AI-generated wiki organized by user-facing features. One click. Zero setup.

> https://wikicube.vercel.app

## Features

- **Repository Analyzer** — Identifies high-level user-facing features (not technical layers) from any public GitHub repo
- **Wiki Generator** — Creates comprehensive wiki pages with inline citations linking to exact GitHub file/line
- **Semantic Search** — Search across the wiki using natural language, powered by Supabase pgvector
- **Q&A Chat** — Ask questions about the codebase and get AI-powered answers with source citations
- **Private Repos** — Sign in with GitHub to index your own private repositories
- **Agent Challenges** — Auto-generated, repo-grounded engineering task specs with a public API
- **Wiki History** — Browse previously generated wikis grouped by recency (today, this week, etc.)
- **Bold Editorial Design** — Clean, light-mode UI with warm off-white, deep charcoal, and golden-yellow accents

## Architecture

WikiCube is three services plus a shared library:

| Service | Path | Stack | Role |
| --- | --- | --- | --- |
| **Frontend** | `src/` | Next.js 15 (App Router), React 19, Tailwind 4 | UI + thin API routes (BFF) |
| **Backend** | `backend/` | Fastify 5, BullMQ + Redis | Runs the analysis pipeline as background jobs |
| **Embedding service** | `embedding-service/` | FastAPI + sentence-transformers | Serves `nomic-embed-text-v1.5` embeddings (768 dims) |
| **Shared library** | `shared/` | TypeScript | GitHub client, GenAI facade, types — imported by frontend and backend as `@shared/*` |

Other pieces:

- **LLM**: OpenRouter via the `openai` SDK — `google/gemini-3.7-flash` for feature identification and challenge generation, `google/gemini-3.5-flash-lite` for page generation, overviews, and chat (`shared/genai/`)
- **Database & auth**: Supabase (PostgreSQL + pgvector; GitHub OAuth for sign-in and private-repo access)
- **Deployment**: Vercel (frontend); the backend, Redis, and embedding service run on any Node/Python host

```
wikicube/
├── src/                    # Next.js frontend + API routes
│   ├── app/api/            #   analyze, chat, search, wiki, wikis, challenges, my-repos, admin, reindex
│   ├── app/wiki/[owner]/[repo]/  # Wiki pages (overview + per-feature)
│   ├── app/challenges/     #   Agent Challenges pages
│   └── components/         #   UI components
├── backend/
│   └── src/
│       ├── routes/         #   /analyze, /reindex, /reindex-all
│       ├── services/       #   auth, supabase, BullMQ queue
│       └── utils/code-analyzer/  # The analysis pipeline (phases A–F)
├── shared/
│   ├── genai/              #   OpenRouter-backed generation (features, pages, overview, chat, challenges)
│   ├── github.ts           #   GitHub API client
│   └── embeddings.ts       #   Client for the embedding service
├── embedding-service/
│   └── src/main.py         #   FastAPI embedding server (nomic-embed-text-v1.5)
└── supabase/               # SQL migrations
```

## Getting Started

### Prerequisites

- Node.js 22+
- Python 3.11+
- Redis (or Docker to run one)
- A Supabase project (free tier works) with the **GitHub OAuth provider enabled**
- An OpenRouter API key

### 1. Clone and install

```bash
git clone https://github.com/nwaughachukwuma/wikicube.git
cd wikicube
npm install                 # frontend + shared
npm install --prefix backend
```

### 2. Set up the database

In your Supabase dashboard → SQL Editor, run in order:

1. `supabase/migration.sql` — tables, indexes, RLS policies, `match_chunks` RPC
2. `supabase/embeddings_dim768.sql` — switches embedding columns to 768 dims
3. Everything in `supabase/migrations/` (e.g. `20260806000000_drop_public_read_policies.sql`)

### 3. Configure environment variables

```bash
cp .env.local.example .env.local        # frontend
cp backend/.env.example backend/.env    # backend
```

**Frontend (`.env.local`):**

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase publishable (anon) key |
| `NEXT_SUPABASE_SECRET_KEY` | Supabase secret key (server-side only) |
| `OPENROUTER_API_KEY` | OpenRouter API key (chat + search) |
| `BACKEND_BASE_URL` | Where the Fastify backend runs, e.g. `http://localhost:3031` |
| `EMBEDDINGS_BASE_URL` | Where the embedding service runs, e.g. `http://localhost:8000` |
| `ADMIN_EMAILS` | Comma-separated admin email addresses (admin console + reindex) |
| `GITHUB_TOKEN` | _(Optional)_ GitHub PAT for higher rate limits (5000/hr vs 60/hr) |

**Backend (`backend/.env`):**

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase publishable (anon) key |
| `SUPABASE_SECRET_KEY` | Supabase secret key |
| `OPENROUTER_API_KEY` | OpenRouter API key (analysis pipeline) |
| `EMBEDDINGS_BASE_URL` | Where the embedding service runs |
| `REDIS_PASSWORD` | Redis password (BullMQ job queue) |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |
| `PORT` / `HOST` | Listen address (defaults: `3031` / `0.0.0.0`) |
| `GITHUB_TOKEN` | _(Optional)_ GitHub PAT for higher rate limits |

**Embedding service:** `CORS_ALLOW_ORIGINS` — _(Optional)_ comma-separated allowed origins (defaults to localhost).

### 4. Run all services

```bash
# Terminal 1 — Redis
docker compose -f backend/docker-compose.yml up

# Terminal 2 — embedding service (downloads the model on first run)
cd embedding-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
granian --interface asgi --host 0.0.0.0 --port 8000 src.main:app

# Terminal 3 — backend
npm run dev --prefix backend

# Terminal 4 — frontend
npm run dev
```

Open http://localhost:3000, paste a GitHub repo URL, and generate your first wiki.

## Analysis Pipeline

Runs in the Fastify backend as BullMQ jobs (`backend/src/utils/code-analyzer/`):

1. **Phase A — Context Gathering** — Fetch repo metadata, filtered file tree (paths only), README, and manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.)
2. **Phase B — Feature Identification** — LLM identifies all user-facing features from the tree + README + manifests; returns features with their relevant file paths
3. **Phase C — Targeted File Fetching** — Per-feature file fetch with a budget of 30 files / 300 lines each, prioritising entry points; keeps context under ~40k tokens
4. **Phase D — Page Generation** — Parallel LLM calls (concurrency 3) generate wiki pages with inline GitHub citations; all run inside `Promise.allSettled()`
5. **Phase E — Overview Generation** — Synthesises all feature titles + summaries into a repo overview page with a Mermaid architecture diagram
6. **Phase F — Embedding** — Chunks all wiki content + source code into ~500-token passages, embeds them via the self-hosted `nomic-embed-text-v1.5` service (768 dims), stores in Supabase pgvector

The frontend polls analysis status and streams progress to the client.

## API Routes (frontend)

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/analyze` | Start analysis (proxies to the backend); re-uses the cached wiki if already `done` |
| `POST` | `/api/chat` | RAG Q&A with conversation history and optional `pageContext`; streams the response |
| `POST` | `/api/search` | Semantic search: embeds the query, calls `match_chunks` RPC, returns ranked results |
| `GET` | `/api/wiki/[owner]/[repo]` | Fetch wiki + features |
| `GET` | `/api/wiki/[owner]/[repo]/status` | Analysis status (polled during generation) |
| `GET` | `/api/wikis` | List completed wikis (history panel) |
| `GET` | `/api/[owner]/[repo]/challenges` | Public Agent Challenges API (paginated) |
| `GET` | `/api/my-repos` | List the signed-in user's GitHub repos (private indexing) |
| `POST` | `/api/reindex`, `/api/reindex-all` | Re-run analysis (admin only) |

## Database Schema

Five tables in Supabase (see `supabase/`):

- **`wikis`** — one row per repo; tracks `status`, `overview`, `visibility`, timestamps
- **`features`** — one row per identified feature; stores `markdown_content`, `entry_points`, `citations`, `sort_order`
- **`chunks`** — one row per embedded passage; stores `embedding vector(768)`, `source_file`, `source_type` (`wiki` | `code`)
- **`wiki_chats`** — per-user chat sessions (RLS-scoped to the owner)
- **`challenges`** — generated Agent Challenge task specs

Vector search uses the `match_chunks` RPC (cosine similarity via `ivfflat` index).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for dev
setup, the checks CI runs, and repo conventions.

## Security

Please report vulnerabilities privately — see [SECURITY.md](./SECURITY.md).
Do not open public issues for security problems.

## License

[Apache-2.0](./LICENSE)
