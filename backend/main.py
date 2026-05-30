import asyncio
import html
import os
import pathlib
import random
import re
import threading
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from uuid import uuid4

import requests
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from question_model import Question
from quiz_brain import QuizBrain

FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend"

_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self';"
)

SESSION_TTL_MINUTES = 30
_daily_lock = threading.Lock()
limiter = Limiter(key_func=get_remote_address)

# Session store: session_id -> {"quiz": QuizBrain, "created_at": datetime}
# NOTE: in-memory; not shared across multiple workers. Use Redis in production.
sessions: dict[str, dict] = {}

# Daily challenge cache: refreshes once per calendar day
daily_cache: dict = {"date": None, "questions": []}


async def _cleanup_sessions() -> None:
    """Remove abandoned sessions older than SESSION_TTL_MINUTES every 5 minutes."""
    while True:
        await asyncio.sleep(300)
        cutoff = datetime.utcnow() - timedelta(minutes=SESSION_TTL_MINUTES)
        stale = [sid for sid, s in list(sessions.items()) if s["created_at"] < cutoff]
        for sid in stale:
            sessions.pop(sid, None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_cleanup_sessions())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000")
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = _CSP
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


class AnswerRequest(BaseModel):
    session_id: str
    answer: str = Field(default="", max_length=500)
    timeout: bool = False


def fetch_daily_questions():
    today = str(date.today())
    if daily_cache["date"] == today and daily_cache["questions"]:
        return daily_cache["questions"]
    with _daily_lock:
        # Double-checked: another thread may have populated the cache while we waited
        if daily_cache["date"] == today and daily_cache["questions"]:
            return daily_cache["questions"]
        try:
            response = requests.get(
                "https://the-trivia-api.com/v2/questions",
                params={"limit": 10, "difficulty": "medium"},
                timeout=10,
            )
            response.raise_for_status()
        except requests.RequestException as e:
            raise HTTPException(status_code=502, detail=f"Failed to reach daily trivia API: {e}")
        data = response.json()
        daily_cache["date"] = today
        daily_cache["questions"] = data
        return data


def build_trivia_api_question(q):
    correct = q["correctAnswer"]
    incorrect = q["incorrectAnswers"]
    text = q["question"]["text"] if isinstance(q.get("question"), dict) else q["question"]
    if q.get("type") == "boolean":
        options = None
    else:
        options = incorrect + [correct]
        random.shuffle(options)
    return Question(text, correct, options)


def fetch_questions(amount=10, q_type="boolean", category=None, difficulty=None):
    parameters = {"amount": amount, "type": q_type}
    if category:
        parameters["category"] = category
    if difficulty:
        parameters["difficulty"] = difficulty
    try:
        response = requests.get("https://opentdb.com/api.php", params=parameters, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach trivia API: {e}")
    data = response.json()
    if data.get("response_code") != 0:
        raise HTTPException(
            status_code=422,
            detail="Not enough questions available for the selected filters. Try fewer questions or different settings."
        )
    return data["results"]


def build_question(q):
    if q.get("type") == "multiple":
        options = q["incorrect_answers"] + [q["correct_answer"]]
        random.shuffle(options)
    else:
        options = None
    return Question(q["question"], q["correct_answer"], options)


def get_session(session_id: str) -> QuizBrain:
    entry = sessions.get(session_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Session not found. Please start a new quiz.")
    return entry["quiz"]


def _make_session(quiz: QuizBrain) -> str:
    session_id = str(uuid4())
    sessions[session_id] = {"quiz": quiz, "created_at": datetime.utcnow()}
    return session_id


def _generate_number_distractors(n: int, count: int = 3) -> list[str]:
    distractors: set[str] = set()
    attempts = 0
    while len(distractors) < count and attempts < 120:
        attempts += 1
        if n <= 5:
            candidate = n + random.randint(1, 8)
        elif n <= 50:
            offset = random.randint(2, max(3, n // 3))
            candidate = n + random.choice([-1, 1]) * offset
        elif n <= 1000:
            offset = random.randint(n // 5, max(n // 2, n // 5 + 1))
            candidate = n + random.choice([-1, 1]) * offset
        elif 1800 <= n <= 2100:
            offset = random.randint(2, 20)
            candidate = n + random.choice([-1, 1]) * offset
        else:
            factor = random.choice([0.5, 0.6, 0.7, 1.3, 1.5, 1.8, 2.0])
            candidate = round(n * factor)
        if candidate != n and candidate > 0:
            distractors.add(str(candidate))
    return list(distractors)[:count]


@app.get("/api/health")
def health():
    return {"status": "Backend running"}


@app.post("/api/daily/start")
@limiter.limit("5/minute")
def start_daily_quiz(request: Request):
    """Start a daily challenge session using The Trivia API (cached per day)."""
    questions_data = fetch_daily_questions()
    question_bank = [build_trivia_api_question(q) for q in questions_data]
    quiz = QuizBrain(question_bank)
    first_q = quiz.load_next_question()
    session_id = _make_session(quiz)
    return {"session_id": session_id, "total": len(quiz.question_list), **first_q}


@app.post("/api/jeopardy/start")
@limiter.limit("10/minute")
def start_jeopardy(request: Request, count: int = Query(10, ge=3, le=20)):
    """Start a Jeopardy session — text-input answers using The Trivia API."""
    try:
        response = requests.get(
            "https://the-trivia-api.com/v2/questions",
            params={"limit": count},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach trivia API: {e}")

    data = response.json()
    question_bank = []
    for q in data:
        correct = q.get("correctAnswer", "")
        text = q["question"]["text"] if isinstance(q.get("question"), dict) else q.get("question", "")
        if not correct or not text:
            continue
        category = q.get("category", "").replace("-", " ").upper()
        question_bank.append(Question(text, correct, None, {"category": category}))

    if len(question_bank) < 3:
        raise HTTPException(status_code=502, detail="Not enough questions returned.")

    quiz = QuizBrain(question_bank, fuzzy=True)
    first_q = quiz.load_next_question()
    session_id = _make_session(quiz)
    return {"session_id": session_id, "total": len(quiz.question_list), **first_q}


# Curated number facts for the Numbers quiz (no external API dependency)
_NUMBER_FACTS: list[tuple[str, str]] = [
    ("A standard piano has ___ keys.", "88"),
    ("There are ___ letters in the English alphabet.", "26"),
    ("The United States has ___ states.", "50"),
    ("A spider has ___ legs.", "8"),
    ("An octopus has ___ arms.", "8"),
    ("There are ___ bones in the adult human body.", "206"),
    ("A full set of adult teeth contains ___ teeth.", "32"),
    ("Human cells contain ___ chromosomes.", "46"),
    ("There are ___ playing cards in a standard deck.", "52"),
    ("A chess board has ___ squares.", "64"),
    ("There are ___ minutes in a day.", "1440"),
    ("There are ___ seconds in an hour.", "3600"),
    ("There are ___ hours in a week.", "168"),
    ("There are ___ days in a leap year.", "366"),
    ("A baker's dozen equals ___.", "13"),
    ("The Eiffel Tower stands ___ metres tall.", "330"),
    ("Mount Everest is ___ metres above sea level.", "8849"),
    ("Water boils at ___ degrees Celsius.", "100"),
    ("Water freezes at ___ degrees Celsius.", "0"),
    ("The atomic number of gold is ___.", "79"),
    ("The atomic number of carbon is ___.", "6"),
    ("The atomic number of iron is ___.", "26"),
    ("There are ___ continents on Earth.", "7"),
    ("There are ___ planets in our solar system.", "8"),
    ("___ is the number of wonders of the ancient world.", "7"),
    ("A marathon covers ___ miles.", "26"),
    ("A hexagon has ___ sides.", "6"),
    ("An octagon has ___ sides.", "8"),
    ("A dodecagon has ___ sides.", "12"),
    ("An icosahedron has ___ faces.", "20"),
    ("Henry VIII had ___ wives.", "6"),
    ("The Berlin Wall fell in ___.", "1989"),
    ("World War II ended in ___.", "1945"),
    ("The US Declaration of Independence was signed in ___.", "1776"),
    ("Neil Armstrong walked on the Moon in ___.", "1969"),
    ("The French Revolution began in ___.", "1789"),
    ("Shakespeare was born in ___.", "1564"),
    ("There are ___ dots on a standard six-sided die in total.", "21"),
    ("A right angle measures ___ degrees.", "90"),
    ("A straight line measures ___ degrees.", "180"),
    ("There are ___ zeroes in one billion.", "9"),
    ("The speed of light is approximately ___ kilometres per second.", "300000"),
    ("The Great Wall of China stretches approximately ___ kilometres.", "21196"),
    ("The Amazon River is approximately ___ kilometres long.", "6575"),
    ("The Nile River is approximately ___ kilometres long.", "6650"),
    ("The Pacific Ocean covers approximately ___ million square kilometres.", "165"),
    ("Africa has ___ countries.", "54"),
    ("The Earth is approximately ___ billion years old.", "4"),
    ("The Moon is approximately ___ kilometres from Earth.", "384400"),
    ("The Sun is approximately ___ million kilometres from Earth.", "150"),
    ("The Mariana Trench is approximately ___ metres deep.", "11034"),
    ("Antarctica covers approximately ___ million square kilometres.", "14"),
    ("Mount Kilimanjaro is ___ metres tall.", "5895"),
    ("The human body has ___ pairs of ribs.", "12"),
    ("A healthy adult human heart beats approximately ___ times per minute.", "72"),
    ("The human eye can distinguish approximately ___ million colours.", "10"),
    ("Sound travels at approximately ___ metres per second in air.", "343"),
    ("The atomic number of oxygen is ___.", "8"),
    ("The atomic number of uranium is ___.", "92"),
    ("The atomic number of hydrogen is ___.", "1"),
    ("The atomic number of nitrogen is ___.", "7"),
    ("DNA has ___ base pairs in a full human genome (in billions).", "3"),
    ("There are ___ weeks in a year.", "52"),
    ("There are ___ days in a non-leap year.", "365"),
    ("There are ___ months with exactly 30 days.", "4"),
    ("The Roman calendar originally had ___ months.", "10"),
    ("A regulation football (soccer) match lasts ___ minutes.", "90"),
    ("A basketball team has ___ players on the court.", "5"),
    ("A standard Olympic swimming pool is ___ metres long.", "50"),
    ("A tennis court is ___ feet wide for singles play.", "27"),
    ("The Tour de France covers approximately ___ kilometres.", "3500"),
    ("A cricket team has ___ players.", "11"),
    ("The Titanic sank in ___.", "1912"),
    ("The first modern Olympic Games were held in ___.", "1896"),
    ("The Wright brothers made their first powered flight in ___.", "1903"),
    ("The Great Fire of London occurred in ___.", "1666"),
    ("Magellan's expedition completed the first circumnavigation of Earth in ___.", "1522"),
    ("A pentagon has ___ sides.", "5"),
    ("A heptagon has ___ sides.", "7"),
    ("A nonagon has ___ sides.", "9"),
    ("A cube has ___ faces.", "6"),
    ("A tetrahedron has ___ faces.", "4"),
    ("An octahedron has ___ faces.", "8"),
    ("There are ___ degrees in a full circle.", "360"),
    ("The smallest prime number greater than 10 is ___.", "11"),
    ("The Statue of Liberty is ___ metres tall from base to torch.", "93"),
    ("The Great Pyramid of Giza was originally ___ metres tall.", "146"),
    ("The Colosseum in Rome could seat approximately ___ spectators.", "50000"),
    ("The Bible contains ___ books.", "66"),
    ("Beethoven composed ___ symphonies.", "9"),
    ("Mozart composed ___ symphonies.", "41"),
]


@app.post("/api/numbers/start")
@limiter.limit("20/minute")
def start_numbers_quiz(request: Request, count: int = Query(8, ge=3, le=12)):
    """Start a numbers quiz using a curated fact bank (fill-in-the-blank format)."""
    pool = random.sample(_NUMBER_FACTS, min(count + 6, len(_NUMBER_FACTS)))
    questions = []
    for template, num_str in pool:
        distractors = _generate_number_distractors(int(num_str))
        if len(distractors) < 3:
            continue
        options = distractors + [num_str]
        random.shuffle(options)
        questions.append(Question(f"Fill in the blank: {template}", num_str, options))
        if len(questions) >= count:
            break

    if len(questions) < 3:
        raise HTTPException(status_code=502, detail="Could not generate enough number questions.")

    quiz = QuizBrain(questions)
    first_q = quiz.load_next_question()
    session_id = _make_session(quiz)
    return {"session_id": session_id, "total": len(quiz.question_list), **first_q}


@app.get("/api/categories")
@limiter.limit("10/minute")
def get_categories(request: Request):
    """Return available trivia categories from Open Trivia DB"""
    try:
        response = requests.get("https://opentdb.com/api_category.php", timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach trivia API: {e}")
    return response.json()


@app.post("/api/start")
@limiter.limit("20/minute")
def start_quiz(
    request: Request,
    amount: int = Query(10, ge=1, le=50),
    q_type: str = Query("boolean"),
    category: int = Query(None),
    difficulty: str = Query(None),
):
    """Start a new quiz session. Returns session_id and the first question."""
    question_data = fetch_questions(amount, q_type, category, difficulty)
    question_bank = [build_question(q) for q in question_data]
    quiz = QuizBrain(question_bank)
    first_q = quiz.load_next_question()
    session_id = _make_session(quiz)
    return {"session_id": session_id, "total": len(quiz.question_list), **first_q}


@app.get("/api/question")
@limiter.limit("60/minute")
def get_question(request: Request, session_id: str):
    """Return the current question without advancing state (safe to call on refresh)."""
    quiz = get_session(session_id)
    q = quiz.get_current_question()
    if q is None:
        return {"message": "Quiz finished", "total": len(quiz.question_list), "score": quiz.score}
    return q


@app.post("/api/answer")
@limiter.limit("60/minute")
def submit_answer(req: AnswerRequest, request: Request):
    """Submit an answer. Returns result and the next question (or quiz_finished flag)."""
    quiz = get_session(req.session_id)

    if req.timeout:
        if quiz.current_question is None:
            raise HTTPException(status_code=400, detail="No active question.")
        if quiz._answered:
            raise HTTPException(status_code=400, detail="Current question has already been answered.")
        quiz._answered = True
        result = {
            "correct": False,
            "correct_answer": html.unescape(quiz.current_question.answer),
            "score": quiz.score,
        }
    else:
        try:
            result = quiz.check_answer(req.answer)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if quiz.still_has_questions():
        result["next_question"] = quiz.load_next_question()
    else:
        result["quiz_finished"] = True
        result["total"] = len(quiz.question_list)
        sessions.pop(req.session_id, None)

    return result


# Must be last — StaticFiles catches all unmatched routes and serves index.html
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
