# OpenCache

**A cache for your life. Context for humans.**

Point your camera at anything you want to remember — a page, a whiteboard, a slide, an error message — and OpenCache turns it into flashcards you actually review. Screenshots, notes, and PDFs work too.

The idea is simple: you already capture things you mean to come back to. Photos of textbook pages, screenshots of docs, saved posts. They pile up and you never look at them again. OpenCache turns that pile into something a spaced-repetition scheduler can hand back to you in the small idle blocks in your day — between gym sets, in line, waiting for a build.

---

## How it works

1. **Capture** — photo, screenshot, PDF, or pasted notes.
2. **Extract** — OCR pulls the text, then a model turns it into question/answer pairs.
3. **Organize** — cards land in a deck. Browse and edit them under **Explore**.
4. **Review** — an Anki-style spaced-repetition scheduler decides what you see and when. Every answer is written to a review log that drives the next interval.

Nothing here asks you to sit down and make a study set. The capture step is one tap; the rest is the app's job.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16, React 19 |
| Styling | Tailwind CSS v4 |
| Auth & DB | Supabase |
| Card generation | `@anthropic-ai/sdk` |
| OCR | `tesseract.js` |
| PDF ingest | `pdf-to-img` |
| Hosting | Vercel |

### Data model

| Table | What it holds |
|---|---|
| `decks` | A named collection of cards. |
| `flashcards` | Front/back plus scheduling state (interval, ease, due date). |
| `review_log` | One row per answer — the history the scheduler reads from. |

> **Note:** the schema currently lives in Supabase rather than in checked-in migration files. Pulling it into `supabase/migrations/` is on the list — until then, a fresh clone won't have tables to talk to.

---

## Running it locally

```bash
git clone https://github.com/nishanthbasava/OpenCache.git
cd OpenCache
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

Then open `http://localhost:3000`.

---

## Roadmap

OpenCache is one engine: **capture → extract → schedule → recall.** What changes between the products below is where the capture comes from and what the cards are for. Same scheduler, same review loop, different front door.

### CacheCode — for developers

Hooks into your CLI while an agent writes code. When Claude Code implements something you didn't fully follow — a vector database, a retry policy, a migration strategy — CacheCode notices the concept, and quizzes you on it later.

The problem it's for: agents ship code faster than you learn from it. You end up with a working repo and no model of why it works. CacheCode makes the things you delegated come back as questions, so delegation doesn't quietly become dependence.

*Status: earliest of the three. Still open on scope — it may end up a mode inside OpenCache rather than its own surface.*

### CacheUp — for students

The classroom shape of the same loop. Photograph the lecture slide, the problem set, the page you highlighted; get a deck you can grind between classes. Leans on the **Explore** surface: public study sets you can browse, fork, and share alongside your private ones — so the person taking the same course isn't rebuilding your deck from scratch.

*Status: planned.*

### CacheFlow — for professionals

For the knowledge that has no exam attached to it. Meeting notes, onboarding docs, a client's org chart, the internals of a system you touch once a quarter. CacheFlow keeps it warm — surfacing what you're about to need instead of what you last captured.

*Status: planned.*

---

## Where this is going

The near-term work is on the thing that makes OpenCache more than photo-to-flashcard: quality of extraction, and the review experience in short sessions. A generic pipeline gets you generic cards. The bet is that a capture-first workflow plus a real scheduler plus cards worth keeping is a different product than a study-set builder, and the gap has to show up in the output.

Open to issues and PRs on any of it.

## License

MIT (add a `LICENSE` file before the repo goes wide).
