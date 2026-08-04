# Portfolio Strategy: The Road to $1M ARR

**Date:** 2026-08-04
**Scope:** Readiness & feasibility audit of all 7 active projects (sirus, amped, alfie, wikicube, workspot, snaq, cedar), followed by a focus decision: pick 2, wind down the rest.

---

## 1. Executive summary

After a full codebase-level audit of all seven platforms, the recommendation is:

**Core focus #1 — Alfie** (AI interview prep + live job board). The only product in the portfolio that is live, taking payments end-to-end, spending on ads, and actively developed. Its revenue leaks are all identified and cheap to fix.

**Core focus #2 — WikiCube** (instant AI wiki for any repo), repositioned around two paid surfaces: private-repo wikis for teams, and the buried **Agent Challenges** generator sold as an API to the agent-eval/training-data market — the highest willingness-to-pay, least-competed asset in the entire portfolio.

**Wind down / freeze:** sirus, amped, snaq, cedar, workspot — with specific salvage actions listed in §5.

The portfolio's consistent pattern: engineering is never the bottleneck; identity, billing mechanics, retention loops, and distribution are. The two chosen products are the two where that gap is smallest relative to market size.

---

## 2. Readiness & feasibility matrix

Scores from independent codebase audits (1–10). "Completeness" = product built & working; "Monetization" = billing/identity/metering in place; "Market" = credible path to $1M ARR in its segment.

| Platform | What it is | Complete | Monetize | Market | Live? | Last activity | Fatal constraint |
|---|---|:-:|:-:|:-:|:-:|---|---|
| **alfie** | AI interview prep + job board | **8** | **7** | 5 | ✅ (ads live) | Aug 3 | None fatal — leaks are fixable |
| **wikicube** | AI repo wiki + agent challenges | **7** | 1 | 4 (wiki) / **7** (challenges) | ✅ (vercel) | Jul 27 | No billing yet; RLS hole on private wikis |
| workspot | Workspace marketplace (Lagos/Abuja) | 8 | 5 | 4 | Beta-ish | Aug 3 | Zero real supply; $10 tickets; geo-locked |
| amped | Founder→VC matching | 6 | 4 | 3 | ❌ | May 27 | $49 one-time ≠ ARR; paywall client-side only; 678-partner dataset given away free |
| sirus | Multi-model "agent council" Q&A | 6 | 1 | 4 | ❌ | Jul 15 | No auth/billing; commoditized; unit costs 3–8× a single-model app |
| snaq | Kids' true/false fact sprints | 5 | 1 | 4 | ✅-ish | Aug 1 | ~129 questions ≈ 25 min of content; anonymous-cookie identity can't be billed |
| cedar | Offline clinical decision support (desktop) | 5 | 1 | 6 | ❌ | Feb 25 | Never released; no identity/billing; HIPAA/FDA burden; ~$2K/mo GPU floor |

### Why Alfie is #1
- **Only product with a working revenue engine today**: Stripe wired end-to-end (2 plans, server-side verification, paywall at 15 call sites, payments history), Supabase auth with RLS, 7 job-board scrapers, ~17.7k LOC, live Google Ads spend (`AW-11481148476` in `src/app/layout.tsx`).
- High-intent market (people with a real interview date have credit cards out).
- Every major revenue leak is diagnosed and small: broken ads conversion tracking (~20 min fix), non-renewing monthly plan (~1 day), no free tier (~half day), no retention loop (~1 week), missing Stripe webhook (~1 day).
- Two unexploited compounding channels already sitting on its own data: programmatic SEO from the job board, and B2B cohort mode (`shared_interview_submissions` already in the schema) for bootcamps/universities.

### Why WikiCube is #2
- Engineering-complete: auth (GitHub OAuth incl. private repos), RAG chat, semantic search, admin console, CI, 71+ tests.
- **Agent Challenges** (`shared/genai/generate-challenges.ts` + public API) auto-generates repo-grounded, SWE-bench-style task specs. The agent-eval and training-data market in 2026 has few sellers, sophisticated buyers (AI labs, agent startups), and high ACVs. Nothing else in the portfolio has this pricing power.
- Structural margin advantage: self-hosted nomic embeddings = no per-token embedding cost.
- The free public wiki is genuinely good top-of-funnel for both paid surfaces.
- Honest caveat: this is the higher-risk bet — demand for the Challenges API must be validated in the first 60 days (see kill criteria, §6).

### Why not Workspot (the hard call)
Workspot is the most *finished* codebase (8/10) and was active yesterday — but it's a two-sided physical marketplace with **zero real supply** (all seed data), founder-gated host onboarding, $10 average tickets where Stripe eats 6–23% of gross take, non-renewing "subscriptions", no host payouts (no Stripe Connect), and a Lagos/Abuja-only footprint. Reaching $83k MRR requires either ~55–83k paid bookings/month or a real-world supply/demand ops grind that would consume all founder time — the opposite of what a portfolio-focus strategy needs. Freeze it cleanly; the code loses no value while parked.

---

## 3. Focus product #1: Alfie — plan to ~$600–700k ARR

### Phase 0 — Stop the bleeding (Week 1)
1. **Fix Google Ads conversion tracking.** Remove the unconditional `gtag('event','conversion',…)` firing on every pageview in `src/app/layout.tsx:70` (it's even labeled with copy from an unrelated property). Fire real conversions on signup, first interview generated, and purchase. Until this is done, all paid spend is optimizing toward bounces.
2. **Make monthly auto-renew.** Move from Payment Links to Stripe Checkout in `mode: subscription` with a real Price object. Today "monthly" is a manual re-purchase = 100% default churn. This single change is what makes "ARR" a real word for this product.
3. **Add the `checkout.session.completed` (+ refund/dispute) webhook.** Right now a user who closes the tab after paying is charged with no subscription row.
4. **Ship a free tier: 1 complete session** (generate → answer → dashboard), then the wall. The founder's own growth doc calls for this; the marketing copy already promises it. Paid traffic into a hard paywall is the most likely reason conversion is low.

### Phase 1 — Build the retention loop (Weeks 2–4)
5. Capture **target role + company + interview date** at session creation. Interview prep is episodic; the date is the entire lifecycle.
6. Postmark lifecycle sequence keyed to the date: T-7 plan, T-3 weak-areas drill (from dashboard scores), T-1 confidence run, T+1 debrief + "next interview?" re-acquisition.
7. Move session history from localStorage to Supabase (tables already exist) so users have a reason to log in again.

### Phase 2 — Compounding acquisition (Months 2–4)
8. **Programmatic SEO off the job board**: `/[company]-interview-questions/[role]` pages generated from `jobs_cache` + the question generator. Thousands of long-tail, high-intent pages no generic prep tool can match, refreshed by the existing daily cron. This is the moat the job-board data was built for.
9. Keep Google Ads paused until #1 and #4 ship; then re-enable with real conversion signals at a small daily cap and scale only on measured CAC < 1/3 LTV.

### Phase 3 — B2B second engine (Months 3–6)
10. Package cohort mode (share → collect submissions → aggregate scoreboard, already in schema) as **Alfie for Bootcamps/Career Centers**: org accounts, seats, instructor dashboard, invoicing. Price $2–5k/yr. The `/for/bootcamps` landing page already exists; it needs a product behind it.
11. 20 design-partner outreaches/week from the founder to bootcamps, university career centers, and job-search communities.

### Alfie revenue model (18-month target)
| Stream | Assumption | ARR |
|---|---|---|
| Individual subs | 3,000 subs @ $12/mo auto-renewing (raise from $10 with annual option) | $432k |
| B2B bootcamps/career centers | 45 accounts @ $4k/yr avg | $180k |
| Lifetime (transitional; phase out or reprice to $99) | ~600/yr @ $99 | ~$60k (non-recurring) |
| **Total** | | **~$610–670k** |

KPIs: free→paid conversion ≥4%; M1 subscriber retention ≥70% (auto-renew); SEO pages indexed and first 10k organic visits/mo by Month 4; 5 B2B design partners by Month 4.

---

## 4. Focus product #2: WikiCube — plan to ~$300–400k ARR

### Phase 0 — Make it sellable (Weeks 1–2)
1. **Fix the RLS hole**: policies on `wikis`/`features`/`chunks`/`challenges` are `using (true)` — private-repo wikis are readable by anyone. Enforce `visibility` at the RLS layer. Non-negotiable before charging anyone.
2. **Add metering + rate limits**: per-user quotas on `analyze` and `challenges` routes (both currently unauthenticated cost sinks burning OpenRouter spend on `gemini-3.1-pro`). You can't price what you don't count.
3. Stripe + `subscriptions`/`usage` tables + plan-enforcement middleware.

### Phase 1 — Two paid surfaces (Weeks 3–6)
4. **Teams plan ($49–99/mo)**: private-repo wikis, N repos, team workspace (add an `orgs`/seats model), webhook-driven reindex on push (kills the "stale docs" objection — reindex machinery already exists, it's just admin-only today).
5. **Agent Challenges API (the pricing-power bet)**: give it a front door — landing page, API keys, docs, usage-based pricing (e.g. $1–2/generated task spec) and design-partner contracts at $1–3k/mo for labs and agent startups. The generator, dedup, pagination, and public API already exist; this is packaging, not research.

### Phase 2 — Validate & scale (Months 2–6)
6. 15 direct outreaches/week to agent-eval teams, agent-framework companies, and model labs. Offer: "repo-grounded SWE task specs from any repo you point us at, on demand." Goal: **3 paying design partners inside 60 days** — this is the go/no-go gate.
7. Free public wikis stay free forever = top-of-funnel + SEO (every generated wiki is a crawlable artifact linking back).
8. Ops hardening as revenue justifies: Dockerize backend + embedding service, deploy workflow, monitoring.

### WikiCube revenue model (18-month target)
| Stream | Assumption | ARR |
|---|---|---|
| Challenges API contracts | 10–12 customers @ $1.5–2.5k/mo avg | $220–300k |
| Teams (private wikis) | 150–250 teams @ $49–99/mo | $110–180k |
| **Total** | | **~$330–480k** |

KPIs: RLS fix + metering shipped in 2 weeks; 3 paying Challenges design partners by Day 60; gross margin ≥85% (watch `gemini-3.1-pro` spend per generation).

---

## 5. The other five: wind-down & salvage actions

| Platform | Action | Salvage |
|---|---|---|
| **workspot** | **Freeze** (don't delete — most finished codebase in the portfolio). Park the branch, stop feature work. Revisit only if a partner appears who owns supply-side ops. | Atomic-reservation pattern, verified-review model, admin console patterns reusable in any future marketplace. |
| **sirus** | Archive. | The cost-aware orchestration layer (`qax-orchestrator.ts`, model selector, query fan-out) is genuinely good infra — extract as a library; it could power WikiCube generation cost-routing. The 700-line viral-content prompt library has resale/reuse value. |
| **amped** | 2-day cleanup, then mothball: close the server-side paywall hole (`/api/analyze`, `/api/compose` are open to the internet on your Gemini key), add privacy policy, ship at $49 as a passive trickle asset — or just take it offline. Do **not** invest further. | VC dataset (678 partners) could be sold/licensed or used as content marketing. |
| **snaq** | Leave live as a free toy (costs ~$0), or archive. One hour of fixes if it stays up: add OG/Twitter card tags (every share currently renders blank) — its only growth mechanism. No commercial path at this content depth. | Server-authoritative game architecture; test/CI discipline as a template. |
| **cedar** | Archive. Regulatory + validation + GPU-cost distance to first dollar is the longest in the portfolio and incompatible with a 2-product focus. | MedGemma multi-angle image-analysis pipeline and local-first HNSW+SQLite design, if healthcare is ever revisited with funding. |

Immediate cost/safety actions regardless of strategy (this week):
- Amped: unauthenticated Gemini endpoints + 25MB uploads = open wallet + DoS exposure. Close or take down.
- Sirus: `/api/qax` is an unauthenticated, unmetered fan-out to frontier models on your OpenRouter key. Take it down or add a key gate.
- WikiCube: same class of issue on `analyze`/`challenges` — fixed by §4 Phase 0.

---

## 6. Portfolio math, sequencing, and kill criteria

**Combined 18-month target:** Alfie ~$610–670k + WikiCube ~$330–480k ≈ **$1M ARR**, with Alfie as the higher-confidence base and WikiCube as the higher-variance upside.

**Sequencing (one founder + AI agents):**
- Weeks 1–2: Alfie Phase 0 (4 fixes) + WikiCube Phase 0 (RLS/metering/billing) + portfolio safety actions. Everything here is small, diagnosed, and high-leverage.
- Weeks 3–8: Alfie retention loop + free tier live + ads re-enabled; WikiCube paid plans + Challenges front door; start both outreach motions.
- Months 3–6: Alfie programmatic SEO + B2B packaging; WikiCube design-partner conversion.

**Kill / reallocate criteria (pre-committed, review at Day 90):**
- WikiCube Challenges: if <3 paying design partners by Day 60 despite ≥100 qualified outreaches, drop the API bet, keep Teams-only at reduced effort, and reallocate everything to Alfie B2B.
- Alfie: if free→paid <2% after the free tier + fixed tracking + 60 days of iteration, halve paid spend and shift the growth motion fully to SEO + B2B.
- Any project outside the core two that demands >2 hrs/week: shut it down harder.

**Operating cadence:** weekly scorecard (MRR, new subs, churn, CAC, conversion, outreach count) — 30 minutes, every Monday. What gets measured compounds; five of seven projects died of unmeasured drift, not bad engineering.
