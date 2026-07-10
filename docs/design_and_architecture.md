# Plan: GitHub Wiki Generator (Revised)

> TL;DR: A Next.js 15 App Router app where a user pastes a GitHub repo URL and gets a comprehensive, AI-generated wiki organized by user-facing features. The analysis pipeline uses a multi-phase approach to handle very large codebases without overloading context windows: tree-based feature identification → targeted file fetching → per-feature page generation. All wiki content and source chunks are embedded (dim-1536) into Supabase pgvector for RAG-powered Q&A and semantic search. Light-mode Bold Editorial design via superdesign.dev. Deploy to Vercel with Supabase integration.

## STEPS

## 1. Project Setup

- npx create-next-app@latest wikicube --typescript --tailwind --app
- Install: openai, @supabase/supabase-js, react-markdown, rehype-raw, remark-gfm, shiki, fuse.js (fallback client search)
- Fonts: Anton (display headlines) + Inter (body/UI) via next/font/google
- Set up .env.local: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN (optional, for rate limits)
- Push to nwaughachukwuma/wikicube repo on main branch; commit each logical step

## 2. Supabase Schema — run via Supabase SQL editor or migration file

- Table wikis: id uuid PK, owner text, repo text, default_branch text, overview text, status text (pending/processing/done/error), created_at, updated_at. Unique constraint on (owner, repo).
- Table features: id uuid PK, wiki_id uuid FK→wikis, slug text, title text, summary text, markdown_content text, entry_points jsonb, citations jsonb, sort_order int
- Table chunks: id uuid PK, wiki_id uuid FK→wikis, feature_id uuid FK→features (nullable), content text, source_type text (wiki | code), source_file text (nullable), embedding vector(1536). Index: CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
- RPC function match_chunks: takes query embedding + wiki_id + match_count + match_threshold → returns top-k chunks ordered by cosine similarity (standard Supabase vector pattern)
- Enable the vector extension in Supabase dashboard

## 3. Shared Types — lib/types.ts

- Wiki, Feature, Chunk, Citation ({ file, startLine, endLine, githubUrl }), EntryPoint ({ file, line, symbol, githubUrl })
- AnalysisStatus enum: pending | fetching_tree | identifying_features | generating_pages | embedding | done | error

## 4. GitHub API Module — lib/github.ts

- getRepoMeta(owner, repo) → default branch, description, homepage URL, topics
- getRepoTree(owner, repo) → flat file list via GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1
- getFileContent(owner, repo, path) → raw text via raw.- githubusercontent.com (avoids API rate limits)
- getMultipleFiles(owner, repo, paths[]) → parallel fetch with concurrency limit (p-limit, 10 at a time)
- buildGitHubUrl(owner, repo, branch, file, startLine?, endLine?) → https://github.com/{owner}/{repo}/blob/{branch}/{file}#L{start}-L{end}
- Fallback for missing README descriptions: also fetch CONTRIBUTING.md, docs/README.md, docs/index.md, homepage URL from repo meta (fetch the homepage HTML and extract <meta description> + <h1> if description is empty/short)

## 5. Analysis Pipeline — The Core — lib/analyzer.ts

This is the critical path. Designed to handle repos with 10k+ files without blowing up context.

### _Phase A — Context Gathering_

- Fetch repo metadata + file tree
- Filter tree: exclude node*modules/, vendor/, dist/, build/, *.lock, \_.min.js, \*.map, test fixtures, assets (images/fonts/videos), .git
- Produce a filtered tree string (paths only, typically <15k tokens even for huge repos)
- Fetch README (+ fallbacks above if short/missing)
- Fetch manifest files: package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml, Gemfile, composer.json — extract project name, description, dependencies

### _Phase B — Feature Identification (LLM Call 1)_

- Input: filtered file tree + README + manifest description + homepage description (if fetched)
- System prompt: "You are a senior technical writer. Given a repo's file tree, README, and metadata, identify ALL high-level user-facing features/subsystems. Think about what the software does for users, not how it's organized technically. Bad: 'Utils', 'API layer', 'Frontend'. Good: 'User Authentication', 'Real-time Notifications', 'Data Export'. For EACH feature, list the specific file paths that implement it (be thorough — include routes, components, services, models). Return JSON: { features: [{ id, title, summary, relevantFiles: string[] }] }"
- Model: gpt-5-mini
- Key: the file tree is just paths (small), so this fits comfortably in context even for huge repos

### _Phase C — Targeted File Fetching_

- For each feature, fetch its relevantFiles via getMultipleFiles()
- Budget per feature: cap at ~30 files. If more are listed, prioritize: entry points (index/main files) first, then by file size (smaller = more likely core logic)
- Per-file truncation: cap each file at 300 lines. If longer, take first 50 lines + last 20 lines + extract function/class signatures from the middle (regex for export, def, class, fn, func, public)
- This keeps per-feature context under ~40k tokens

### _Phase D — Wiki Page Generation (LLM Call 2, parallel per feature)_

- For each feature, send its file contents + feature summary
- System prompt: "Generate a comprehensive wiki page for the '{title}' feature of {repo}. Structure: Overview → How It Works (user perspective) → Technical Details (architecture, key modules, data flow) → Configuration/Setup → Key Entry Points. Use inline citations linking to exact GitHub lines: [filename.ts#L42](full-url). Be thorough and accurate — reference every claim to specific code. Return JSON: { markdownContent, entryPoints: [{file, line, symbol, githubUrl}], citations: [{file, startLine, endLine, githubUrl}] }"
- Run all features in Promise.allSettled() with concurrency limit of 3 (to avoid rate limits)

### _Phase E — Overview Generation (LLM Call 3)_

- Input: all feature titles + summaries
- Generate a repo overview page: what the project does, architecture diagram (mermaid markdown), feature map
- This becomes the wiki landing page

### _Phase F — Embedding_

- Chunk all markdownContent into ~500-token passages (split on paragraph/heading boundaries to preserve context)
- Also chunk important source files fetched in Phase C (same 500-token strategy, include file path + line range as metadata)
- Generate embeddings via openai.embeddings.create({ model: "text-embedding-3-small", input: chunkText }) — 1536 dimensions
- Batch embed (OpenAI supports up to 2048 inputs per call; batch in groups of 100)
- Upsert all chunks + embeddings into Supabase chunks table

## 6. API Routes

POST /api/analyze — { repoUrl }: parse owner/repo, create wiki row in Supabase (status: pending), kick off analysis pipeline. Return { wikiId } immediately. Use Vercel background function or streaming SSE to report progress.

> GET /api/analyze/[wikiId]/status — SSE stream: emits status updates (fetching_tree, identifying_features, generating: Feature Name, embedding, done)

> GET /api/wiki/[owner]/[repo] — Fetch wiki + features from Supabase. Returns full wiki data.

> POST /api/chat — { wikiId, question, history[] }: embed question → call match_chunks RPC (top 8 chunks, threshold 0.7) → feed chunks as context to gpt-5-mini with streaming. System prompt: "Answer questions about this codebase using ONLY the provided wiki and code context. Cite specific features and files. If unsure, say so." Return streamed response.

> POST /api/search — { wikiId, query }: embed query → call match_chunks (top 10) → return matching features/sections with snippets. This gives semantic search across the wiki.

## 7. UI — Bold Editorial Light Mode

Design tokens adapted from the Bold Editorial Style to light mode:

- Background: #FAFAF8 (warm off-white)
- Text: #171e19 (deep charcoal)
- Accent: #ffe17c (golden yellow) for highlights, active states, badges
- Secondary accent: #171e19 for buttons/CTAs (charcoal with yellow hover)
- Font: Anton for page titles/hero, Inter for body
- Layout: structured grid, oversized headings, aggressive hierarchy, minimal rounded corners (2px max)
- Code blocks: shiki with a light theme, subtle border

### _Landing Page — app/page.tsx_

- Large bold headline ("Generate a Wiki for Any GitHub Repo" in Anton), subtext, a single URL input + "Generate" button
- Below: 3 pre-generated example wikis (cards in a bento grid) for rich-cli, browser-use, todomvc
- Clicking an example → instant wiki view; entering a new URL → progress page

### _Progress Page — app/wiki/[owner]/[repo]/loading/page.tsx_

- Full-page SSE consumer showing a checklist of analysis phases
- Each feature title appears as it's generated; transitions to the wiki when done

### _Wiki Layout — app/wiki/[owner]/[repo]/layout.tsx_

- Left sidebar: repo name, feature list (links), semantic search bar
- Main content: feature page
- Right rail: auto-generated table of contents from H2/H3 headings
- Mobile: sidebar collapses to hamburger; right rail hidden

### _Wiki Overview — app/wiki/[owner]/[repo]/page.tsx_

- Repo overview markdown + feature cards grid (title, summary, "Read more →")

### _Feature Page — app/wiki/[owner]/[repo]/[featureSlug]/page.tsx_

- Rendered markdown via react-markdown + remark-gfm + rehype-raw
- Code blocks with shiki syntax highlighting
- Citation links styled as small chips/badges (file + line, opens GitHub in new tab)
- Entry points block at top

### _Search — components/SearchBar.tsx_

- Input in sidebar
- On type (debounced 300ms), call /api/search → show results dropdown with feature name + snippet + relevance
- Click result → navigate to feature page, scroll to relevant section

### _Q&A Chat — components/ChatPanel.tsx_

- Floating button bottom-right → opens slide-over panel
  Chat messages with streaming response
- Each AI answer shows "Sources" footer: linked feature names + file citations
- Conversation history maintained in state (passed to API for multi-turn)

## 8. Pre-generate Example Wikis

- Script scripts/pregenerate.ts (run locally): runs pipeline against rich-cli, browser-use, todomvc
- Stores results in production Supabase before submission
- Evaluators see instant results on first click

## 9. Deploy

- Link nwaughachukwuma/wikicube to Vercel
- Enable Vercel-Supabase integration (auto-injects env vars)
- Set maxDuration = 300 on /api/analyze route (large repos can take a few minutes)
- Additional env: OPENAI_API_KEY, GITHUB_TOKEN

---

## Verification

- Test against all 3 spec repos: rich-cli, browser-use, todomvc
- Test against a large repo (e.g. vercel/next.js or facebook/react) to confirm chunking/budgeting works
- Confirm feature labels are user-facing (no "utils", "API layer")
- Verify citation links open correct GitHub file + line
- Test Q&A: "How does browser-use handle page navigation?" — should return accurate answer with sources
- Test semantic search: query "authentication" should surface relevant features/sections
- Confirm Supabase vector search returns in <500ms
- tsc --noEmit + eslint clean

## Decisions

- Supabase pgvector over plain KV: enables RAG for Q&A and semantic search — scales to large codebases
- Tree-first feature identification: the file tree (paths only) fits in one prompt for any repo size, so feature ID never blows the context window
- Per-feature file budget (30 files, 300 lines): keeps page generation under ~40k tokens per call
- `text-embedding-3-small` (1536 dims): matches Supabase dim-1536 requirement, cheaper and faster than ada-002
- SSE for progress: real feedback during multi-minute analysis, no polling
- Light-mode Bold Editorial: warm off-white + charcoal + golden yellow accent — adapted from superdesign.dev's "Bold Editorial Style" for a dev-docs context
- Two-tier search: semantic (via embeddings) for accuracy, with fuse.js as instant client-side fallback for feature titles
