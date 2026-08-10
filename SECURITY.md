# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately via
[GitHub's private vulnerability reporting](https://github.com/nwaughachukwuma/wikicube/security/advisories/new)
("Report a vulnerability" on the repo's Security tab). Include reproduction
steps, impact, and any suggested fix.

You can expect an acknowledgement within a few days. Please give us a
reasonable window to ship a fix before public disclosure.

## Scope

In scope:

- Code in this repository (frontend, backend, shared library, embedding
  service, SQL migrations)
- The hosted deployment at https://wikicube.vercel.app

Out of scope:

- Vulnerabilities in third-party services (Supabase, Vercel, OpenRouter,
  GitHub) — report those upstream
- Denial of service via volume alone, and issues requiring physical access

## Areas of particular sensitivity

- **GitHub OAuth tokens.** Sign-in requests the `repo` scope for private-repo
  indexing; provider tokens are forwarded server-side via the
  `X-Provider-Token` header. Anything that could leak or replay these tokens
  is critical.
- **Private-repo wiki content.** Rows in `wikis`, `features`, and `chunks`
  with `visibility = 'private'` must never be readable by other users —
  whether via RLS policies, API routes, or search/chat retrieval.
- **Admin surfaces.** `/admin` and the reindex endpoints are gated by the
  `ADMIN_EMAILS` env var; bypasses are critical.
- **LLM spend.** The analyze/challenges endpoints trigger paid model calls;
  abuse vectors that let a third party drive unbounded spend are in scope.

## Supported versions

Only the latest `main` is supported. There are no maintained release branches;
fixes land on `main` and deploy from there.
