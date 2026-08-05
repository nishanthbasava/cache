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

- `components/` — shared React components (BottomNav, CaptureCamera, SignUpForm)
- `components/ui/` — shadcn/ui primitives (Button)
- `lib/supabase/client.ts` — browser Supabase client via `@supabase/ssr`
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)

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
