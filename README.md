# Kosmodrome 2026 — 48 Hours to Orbit

Official website, participant portal, judging system, and backend API for **Kosmodrome 2026 — 48 Hours to Orbit** (conducted under **DHANAK: Ember from Ashes** by the students of the **Indian Institute of Space Science and Technology (IIST)**).

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, Cache Components, Partial Prefetching)
- **UI:** React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/turbopack`), custom design system (`app/globals.css`)
- **3D & Motion:** Three.js / `@react-three/fiber`, Lenis smooth scrolling, Full / Lite / Off effects modes
- **Backend & Database:** Next.js Route Handlers (`app/api/`) + Supabase (PostgreSQL + RLS + Private Storage buckets)
- **Testing:** `tsx --test` (`tests/*.test.ts`)

## Key Features

- **Public Website (`app/`):** Home, `/about`, `/tracks`, `/timeline`, `/scoring`, `/rules`, `/submission`, `/fair-play`, `/prizes`, `/faq`, `/contact`, and `/register`.
- **Participant Team Portal (`/portal`):** Per-member personal keys (`kmp_...`), Annex A Integrity Declarations, T0 problem statement release (per-team seeds, visible & hidden text watermarks, CSV canary records), Checkpoints 1–3, direct-to-storage signed uploads with magic-byte sniffing and SHA-256 manifests, Advanced prediction leaderboard, support tickets, and post-provisional appeals.
- **Judging & OC Admin APIs (`/api/judge/*`, `/api/admin/*`):** Blind Stage 1 judging, Grand Jury Stage 2, automated moderation triggers, script-computed ranking with tie-breakers, winner audit gate, hash-chained append-only ledger, leak tracing, and 180-day personal-data retention cron (`/api/cron/retention`).

## Project Structure

```text
app/
  api/               Backend Route Handlers (register, contact, health, results, portal, judge, admin, cron)
  components/        UI primitives, fx, layout (Navbar/Footer), sections, 3D spaceport scene, portal UI
  content/           Static site configuration and event data
  services/          Frontend API client and client-side ID compression
  types/             Shared TypeScript API contracts
lib/                 Server-side Supabase client, auth, validation, rules, schedule, scoring, watermarks
supabase/migrations/ SQL migrations (0001_init.sql, 0002_portal.sql)
tests/               Unit, parity, and route-level backend tests
docs/                API contracts and frontend/backend handoff docs
public/              Static assets (logos)
```

## Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   Copy `.env.example` to `.env.local` and fill in your Supabase URL, keys, and server secrets. **Never commit `.env.local`.**

   ```bash
   cp .env.example .env.local
   ```

3. **Initialize Supabase:**

   Run the migrations in order in your **Supabase Dashboard → SQL Editor** (or `supabase db push`):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_portal.sql`

   This creates the 24 tables (with RLS deny-all enabled for `anon`/`authenticated`), RPC functions, triggers, and private storage buckets (`college-ids`, `problems`, `submissions`).

4. **Run locally:**

   ```bash
   npm run dev        # http://localhost:3000 (or: npx next dev -p 5000)
   npm test           # Run test suite (137 tests)
   npm run build      # Production build
   npm start          # Serve production build
   npm run lint       # ESLint
   ```

## Deploying to Vercel

1. Import the GitHub repository into Vercel.
2. Add all required variables from `.env.example` under **Project Settings → Environment Variables** (including `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_MODE=live`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, `TEAM_SEED_SECRET`, `ADMIN_API_TOKEN`, `CRON_SECRET`).
3. Deploy — `next build` builds all static marketing pages and dynamic `/api/*` serverless routes automatically.

## Documentation

- [docs/api-contract.md](docs/api-contract.md) — Public registration & contact API contract
- [docs/PORTAL_API.md](docs/PORTAL_API.md) — Participant, judge, and OC portal endpoints
- [docs/FRONTEND_HANDOFF.md](docs/FRONTEND_HANDOFF.md) — Frontend architecture and content constants
- [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md) — Backend architecture and rulebook enforcement
- [CONTRIBUTING.md](CONTRIBUTING.md) — Branch and PR workflow
