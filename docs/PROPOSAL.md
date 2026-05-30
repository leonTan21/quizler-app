# Quizler — Feature Proposals v3
**Status: Awaiting approval. No code changes made.**

---

## 1. New Game Modes

### 1a. Multiplayer Duel
Two players answer the same question simultaneously. First to answer correctly wins the round. First to 5 rounds wins the match. Requires WebSocket connection between two sessions.

### 1b. Streak Attack
Answer correctly to keep your streak alive. Each correct answer increases a multiplier (x1 → x2 → x3...). Wrong answer resets multiplier to x1 but doesn't end the game. Score = questions correct × multiplier at the time. Leaderboard ranked by final score, not raw correct count.

### 1c. Category Gauntlet
Play through all 8 categories back-to-back — 5 questions each, 40 total. A single unifying score at the end. Tests breadth of knowledge rather than depth in one topic.

### 1d. Elimination
Start with 3 lives. Wrong answer costs a life. Correct answers do not restore lives. Game ends when all lives are gone or all questions answered. Score = questions survived.

---

## 2. Authorization (User Accounts)

Currently all data (streak, stats, bookmarks) is stored in `localStorage` — it's device-specific and lost if the browser is cleared.

**Proposed: Optional account system**

- Sign up / log in with email + password, or Google OAuth
- All localStorage data migrated to the database on first login
- Stats, streaks, and bookmarks sync across devices
- Guest mode remains fully functional — accounts are opt-in, not required

**Tech:**
- **Supabase Auth** handles sign-up, login, JWT tokens, and OAuth out of the box
- Frontend adds a small auth module; logged-in state stored in memory + a short-lived cookie
- Backend verifies the Supabase JWT on protected routes

**Risk:** Adds meaningful complexity to both frontend and backend. Should be implemented after the leaderboard (below) since auth is a prerequisite for it.

---

## 3. Online Leaderboard

A global leaderboard for competitive modes — Sudden Death (highest streak) and Timed Challenge (most correct in session).

**Requires:**
- **Database**: Supabase (Postgres) — free tier covers this comfortably
- **Auth** (Proposal 2) — entries need to be tied to a user, not just a device
- A `scores` table: `user_id`, `mode`, `score`, `achieved_at`

**Display:**
- Top 10 all-time per mode
- Your personal rank highlighted even if outside top 10
- Refreshes on page load (no real-time required)

**Backend additions:**
- `POST /api/scores` — submit a score (JWT-authenticated)
- `GET /api/leaderboard/{mode}` — return top 10 + caller's rank

**Why Supabase over a custom DB:**
- Managed Postgres with a REST API out of the box
- Auth, database, and row-level security in one service
- Free tier: 500 MB storage, 2 GB bandwidth — plenty for this scale
- `supabase-py` is a single pip install

---

## 4. Mobile Version

The current app is responsive but designed primarily for desktop. A proper mobile experience would include:

**Option A — Progressive Web App (PWA)**
- Add a `manifest.json` and service worker
- Users can "Add to Home Screen" on iOS and Android
- Offline support for cached questions
- No app store required
- **Effort: low** — mostly config, no code rewrite

**Option B — React Native / Expo**
- Native iOS and Android app
- True push notifications (daily challenge reminder)
- Better gesture support and animations
- Shares backend with the web app
- **Effort: high** — full rewrite of the frontend in a new framework

**Recommendation: Option A first.** PWA gets 80% of the mobile benefit with 20% of the effort. If usage on mobile grows significantly, revisit Option B.

**Immediate mobile improvements (no PWA needed):**
- Larger tap targets on answer buttons
- Bottom-anchored navigation for one-thumb reach
- Haptic feedback on answer (web vibration API)

---

## 5. AI-Generated Questions (Custom Topic)

The biggest gap in trivia databases is specificity — no API covers niche topics. With a Claude API call, users can type any topic and get 10 freshly generated questions instantly.

**How it works:**
- New mode card on Home: **"Custom Topic"**
- User types a topic (e.g. "Formula 1 in the 2000s", "Harry Potter spells", "History of jazz")
- Backend calls `claude-haiku-4-5` with a structured prompt requesting N multiple-choice questions as JSON
- Response parsed and fed into the existing quiz session engine
- Frontend runs it through the same quiz UI — no new screens needed

**Example prompt:**
> Generate 10 multiple choice trivia questions about "{topic}". Return only valid JSON — an array of objects with keys: question (string), correct_answer (string), incorrect_answers (array of 3 strings). Questions should be factual, varied in difficulty, and not repeat.

**Why Haiku:**
- Fast enough for real-time generation (typically under 2 seconds)
- Cheap — ~$0.001 per quiz generation
- Reliable structured JSON output with the prompt above

**Risk:**
- Requires an Anthropic API key stored server-side (never exposed to client)
- Generated questions may occasionally contain inaccuracies — add a disclaimer
- Rate limiting should be applied per IP to prevent abuse
- Cost scales with usage — monitor via Anthropic dashboard

---

## Priority Recommendation

1. **PWA / mobile improvements** — highest impact, lowest effort
2. **AI Custom Topic** — unique differentiator, one backend endpoint + one UI screen
3. **Authorization** — needed before leaderboard; moderate effort
4. **Online Leaderboard** — requires auth; completes the competitive loop
5. **New Game Modes** — Elimination and Streak Attack are quick builds; Multiplayer Duel is a larger project

---

*Awaiting approval before implementation begins.*
