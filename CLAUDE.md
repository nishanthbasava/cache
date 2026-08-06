# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript type checking (`tsc --noEmit`)
- CI runs lint, typecheck, and build on every push/PR to main

## Architecture

**Cache** is a Next.js 16 learning app ("Capture now. Learn later.") using React 19, Tailwind CSS v4, and Supabase for auth. Deployed on Vercel.

### Routing

Uses the App Router with a route group layout:

- `app/page.tsx` — landing/sign-up page (public)
- `app/(app)/` — authenticated app shell with `BottomNav` (Organize, Capture, Study)
  - `capture/page.tsx` — camera capture page
  - `organize/page.tsx` — placeholder
  - `study/page.tsx` — placeholder

### Key directories

- `components/` — shared React components (BottomNav, CaptureCamera, FlashcardDeck, StudySession, SignUpForm)
- `components/ui/` — shadcn/ui primitives (Button)
- `lib/scheduler/` — Anki v3 (SM-2) spaced repetition, pure and I/O-free
- `lib/study.ts` — Supabase reads/writes for the study session
- `lib/supabase/client.ts` — browser Supabase client via `@supabase/ssr`
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `supabase/migrations/` — SQL to paste into the Supabase SQL editor

### Spaced repetition

`lib/scheduler/anki.ts` is a port of Anki's v3 scheduler (SM-2), with Anki's
stock deck options as `DEFAULT_DECK_CONFIG`: learning steps 1m/10m, relearning
step 10m, graduating interval 1d, easy interval 4d, starting ease 2.50, hard
multiplier 1.2, easy bonus 1.3, new interval 0.0, leech threshold 8, 20 new and
200 reviews per day, 4am rollover.

`nextStates()` computes all four button outcomes at once so the interval printed
on a button (fuzz included) is exactly what gets applied — call it once per card
shown and persist the entry the user picks. `lib/scheduler/queue.ts` handles
gather order: due learning cards preempt everything, new cards mix evenly into
reviews, and the 20-minute learn-ahead limit pulls learning cards forward once
nothing else is left.

Daily counters are derived from the `review_log` table rather than stored, so
they stay correct across devices and roll over for free.

### Styling

- Tailwind CSS v4 with `@tailwindcss/postcss`
- Fonts: Gowun Batang (`--font-gowun-batang`, used as `font-heading`) and Raleway (`--font-raleway`, used as `font-sans`)
- shadcn/ui with `class-variance-authority` for component variants

### Auth

- Supabase Auth with email/password (sign-up and log-in)
- Browser client only (`createBrowserClient` from `@supabase/ssr`)
- No middleware auth guard yet
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### Path alias

`@/*` maps to the project root (configured in `tsconfig.json`).
