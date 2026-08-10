# Contributing to WikiCube

Thanks for your interest in contributing! This document covers how to get a
working dev environment, the checks your changes must pass, and how to submit
them.

## Project layout

WikiCube is three services plus a shared library — see the
[Architecture](./README.md#architecture) section of the README:

- `src/` — Next.js frontend + API routes
- `backend/` — Fastify analysis backend (BullMQ + Redis)
- `shared/` — TypeScript library imported by frontend and backend as `@shared/*`
- `embedding-service/` — FastAPI embedding server
- `supabase/` — SQL migrations

## Development setup

Follow [Getting Started](./README.md#getting-started) in the README. The short
version:

```bash
npm install
npm install --prefix backend
cp .env.local.example .env.local      # fill in your keys
cp backend/.env.example backend/.env  # fill in your keys
```

Then run the services you need — for most frontend work `npm run dev` alone is
enough; pipeline work needs Redis, the backend, and the embedding service too
(or run everything with `docker compose up --build`).

You'll need your own free-tier Supabase project and an OpenRouter API key;
there is no shared development environment.

## Before you open a PR

CI runs these on every PR — run them locally first:

**Frontend / shared:**

```bash
npm run tsc -- --noEmit   # typecheck
npm run lint
npm run test              # vitest unit tests
npm run test:e2e          # Playwright (uses a local mock server)
```

**Backend** (build shared types first — backend typechecking depends on them):

```bash
npx tsc -p shared/tsconfig.json
cd backend
npm run tsc -- --noEmit
npm run lint
npm run test
```

## Making changes

- **Branch from `main`** and keep PRs focused — one logical change per PR.
- **Match the existing style.** ESLint and the TypeScript config are the
  source of truth; don't introduce new formatting conventions.
- **Add tests** for behavior changes. Unit tests live in `tests/` (frontend)
  and `backend/tests/`; e2e specs in `tests/e2e/`.
- **Database changes** go in a new timestamped file under
  `supabase/migrations/` — never edit an existing migration.
- **Commit messages**: short imperative subject lines, conventional prefixes
  (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`) are welcome but not enforced.
- **LLM prompts** live in `shared/genai/`. Prompt changes are hard to review
  from the diff alone — include a before/after example of the generated output
  in the PR description.

## Reporting bugs and proposing features

Open a GitHub issue with reproduction steps (for bugs) or the problem you're
trying to solve (for features). For anything security-sensitive, **do not open
a public issue** — see [SECURITY.md](./SECURITY.md).

## Costs to be aware of

Running the analysis pipeline calls OpenRouter models on your own key. A
single wiki generation for a mid-sized repo typically costs a few cents, with
`google/gemini-3.1-pro-preview` (feature identification, challenges) the main
driver. Keep experiments on small repos while iterating.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE).
