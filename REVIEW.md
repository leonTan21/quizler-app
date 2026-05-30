# Quizler — Product Review
**Date:** 2026-05-30  
**Scope:** Security, bugs, design — consumer readiness assessment

---

## Security

### Critical

| # | Issue | Location |
|---|-------|----------|
| S1 | **CORS wildcard** — `allow_origins=["*"]` allows any domain to call the API. Must be locked to the deployed frontend origin before going live. | `backend/main.py:15` |
| S2 | **Hardcoded localhost URL** — `API_BASE = "http://127.0.0.1:8000"` is baked into the frontend. The app cannot be deployed without manually editing this. Should use an environment variable or relative URL. | `frontend/app.js:1` |
| S3 | **No HTTPS** — The backend runs over plain HTTP. Required for any public-facing deployment. |

### High

| # | Issue | Location |
|---|-------|----------|
| S4 | **No rate limiting** — Every endpoint is open to unlimited requests. A single client could spam `/api/start` indefinitely, exhausting external API quotas and server memory. | `backend/main.py` |
| S5 | **Session ID and answer in query string** — `POST /api/answer?session_id=...&answer=...` — both values appear in server logs and browser history. Should be moved to the request body. | `backend/main.py:343` |
| S6 | **`server.log` committed to the repo** — Log files should be in `.gitignore`, not version controlled. | `backend/server.log` |

### Medium

| # | Issue | Location |
|---|-------|----------|
| S7 | **No Content Security Policy** — No CSP header is set on the backend responses. | `backend/main.py` |
| S8 | **No input length limit on answers** — The `answer` query parameter has no max length. A very large string could be passed on every request. | `backend/main.py:344` |
| S9 | **CORS + future auth incompatibility** — The PROPOSAL.md plans Supabase auth. A wildcard CORS policy combined with `allow_credentials=True` is explicitly forbidden by browsers. This will break auth unless fixed now. | `backend/main.py:13-18` |

---

## Bugs

### High

| # | Issue | Location |
|---|-------|----------|
| B1 | **Memory leak — sessions never expire** — Sessions are only removed on quiz completion (`del sessions[session_id]`). If a user abandons a quiz mid-way (closes tab, navigates away), the session object stays in memory forever. Under real traffic this will grow unbounded and eventually crash the server. Needs a TTL-based cleanup. | `backend/main.py:357` |
| B2 | **No `requirements.txt` or `pyproject.toml`** — There is no dependency file. The project cannot be installed or deployed reproducibly by anyone other than the original developer. |

### Medium

| # | Issue | Location |
|---|-------|----------|
| B3 | **`JSON.parse()` without try/catch in all localStorage helpers** — `getStreak()`, `getStats()`, and `getBookmarks()` will throw and crash the app if localStorage contains corrupted or manually edited data. | `frontend/app.js:23,54,76` |
| B4 | **Visual glitch in timed mode** — `displayQuestion()` calls `updateProgressDots()` on every question load, which overwrites `#questionCounter` with `Q X / 50`. In timed mode this counter shows the remaining time — so the counter briefly flashes the wrong text before the 200ms interval corrects it. | `frontend/app.js:815,914` |
| B5 | **`__timeout__` sent as a literal answer to the backend** — When a per-question timer expires, the string `"__timeout__"` is submitted as the answer. The backend accepts and scores it as a normal wrong answer. It works, but it's fragile — a question with the correct answer `"__timeout__"` would be incorrectly handled. A dedicated timeout endpoint or flag would be cleaner. | `frontend/app.js:839`, `backend/main.py:343` |

### Low

| # | Issue | Location |
|---|-------|----------|
| B6 | **Dead code — `_clean_jeopardy_text` never called** — The function is defined but not used anywhere in the codebase. | `backend/main.py:96-99` |
| B7 | **Daily cache is not thread-safe** — `daily_cache` is a plain dict mutated without any locking. Under concurrent requests this could result in a race condition where two requests both see a stale cache and both trigger API calls simultaneously. | `backend/main.py:24,27-43` |

---

## Design

### Deployment Blockers

| # | Issue |
|---|-------|
| D1 | **`API_BASE` hardcoded to localhost** — The app is not deployable without a code change. Should be driven by a build-time variable or a config file. |
| D2 | **No deployment configuration** — No Dockerfile, no environment variable handling, no production server config (e.g. Gunicorn/Uvicorn workers). |
| D3 | **`PROPOSAL.md` in the repo root** — Internal planning documents should not be in the root of a public-facing repository. Move to a `docs/` folder or remove. |

### User Experience

| # | Issue |
|---|-------|
| D4 | **No warning when navigating away mid-quiz** — The back button and browser navigation silently abandon a quiz with no confirmation prompt. Progress is lost with no indication. |
| D5 | **No graceful degradation when the server is down** — If the backend is unreachable, the app shows a bare error string. There is no offline mode, no cached fallback, and no retry option. |
| D6 | **All data is localStorage-only** — Stats, streaks, and bookmarks are device-specific. Clearing browser data or switching devices loses everything permanently. This is the single biggest retention risk. |
| D7 | **Score is hidden during the quiz** — `.quiz-meta { display: none }` hides the score span entirely. Players have no running score feedback during gameplay. Intentional or not, this should be a conscious decision. |
| D8 | **Quick Play is True/False only** — The home screen describes it as "10 questions · random · no setup" which implies general trivia, but the mode only fetches boolean questions. Multiple choice should be an option. |

### Accessibility

| # | Issue |
|---|-------|
| D9 | **Mode cards are not keyboard accessible** — Cards use `onclick` with no `tabindex` or `role="button"`. Keyboard-only users cannot navigate the home screen. |
| D10 | **No focus management on page transitions** — When navigating between pages, focus is not moved to the new content. Screen reader users get no signal that the page has changed. |

### Minor

| # | Issue |
|---|-------|
| D11 | **Stats history is capped at 7 visible / 20 stored** — No way to view older game history. |
| D12 | **Categories are hardcoded to 8** — The opentdb API exposes far more categories. The `/api/categories` endpoint already fetches the full list but the frontend ignores it. |

---

## Priority Order for Fixes

1. **S2, D1** — Fix the hardcoded `API_BASE` (deployment blocker)
2. **B2** — Add `requirements.txt` (deployment blocker)
3. **B1** — Add session TTL / cleanup (stability)
4. **S1** — Restrict CORS to the deployed origin (security)
5. **S4** — Add rate limiting (security)
6. **B3** — Wrap localStorage reads in try/catch (reliability)
7. **S5** — Move session_id and answer to request body (security)
8. **S6** — Add `server.log` to `.gitignore` (housekeeping)
9. **D4** — Add mid-quiz navigation warning (UX)
10. **D9, D10** — Keyboard and focus accessibility (accessibility)
