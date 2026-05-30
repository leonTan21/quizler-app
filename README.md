# Quizler

A dark-themed trivia web app with a FastAPI backend and vanilla JS frontend. No framework, no build step — open the HTML file and play.

## Modes

| Mode | Description |
|---|---|
| **Daily Challenge** | 10 questions refreshed once per day. Completing builds a daily streak. |
| **Sudden Death** | Answer as many as you can — one wrong answer ends the game. Tracks your personal best. |
| **Timed Challenge** | Answer as many questions as possible before time runs out (60 / 90 / 120 seconds). |
| **Jeopardy** | Real trivia questions with typed free-text answers and fuzzy matching. |
| **Categories** | 8 topic rooms (Geography, Science, History, Film & TV, Sports, Technology, Books, Music) with difficulty and question count selectors. |
| **Quick Play** | Random true/false questions, no setup. |
| **Number Facts** | Fill-in-the-blank questions drawn from a curated bank of number trivia. |

## Features

- Hash-based SPA routing — no page reloads
- Daily streak tracking via `localStorage`
- Per-mode stats and game history
- Bookmark questions during a quiz and review them on the Saved page
- Session-based quiz engine on the backend — safe to refresh mid-quiz
- Fuzzy answer matching for Jeopardy (strips articles, punctuation, HTML)

## Stack

- **Backend**: Python · FastAPI · Uvicorn
- **Frontend**: Vanilla JS · CSS (no framework) · Google Fonts (Syne + Inter)
- **Data sources**: [Open Trivia DB](https://opentdb.com) · [The Trivia API](https://the-trivia-api.com)

## Setup

### Backend

```bash
cd backend
pip install fastapi uvicorn requests
uvicorn main:app --reload
```

Server runs at `http://127.0.0.1:8000`.

### Frontend

Open `frontend/index.html` directly in a browser. No build step required.

Make sure the backend is running first — the frontend fetches from `http://127.0.0.1:8000`.

## Project structure

```
backend/
  main.py           # FastAPI app, all endpoints
  quiz_brain.py     # Session state, answer checking, fuzzy matching
  question_model.py # Question dataclass

frontend/
  index.html        # Shell — header + router outlet
  app.js            # SPA router, all page renderers, quiz engine
  style.css         # All styles
```

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/start` | Start a standard quiz (params: `amount`, `q_type`, `category`, `difficulty`) |
| `POST` | `/api/daily/start` | Start the daily challenge (cached per calendar day) |
| `POST` | `/api/jeopardy/start` | Start a Jeopardy session (`count` param) |
| `POST` | `/api/numbers/start` | Start a Number Facts quiz (`count` param) |
| `GET` | `/api/question` | Get current question without advancing state |
| `POST` | `/api/answer` | Submit an answer, returns result + next question |
| `GET` | `/api/categories` | List available trivia categories |
