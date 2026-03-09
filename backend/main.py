from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from question_model import Question
from quiz_brain import QuizBrain
import requests

app = FastAPI()

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def fetch_questions(amount=10):
    """Fetch questions from Open Trivia API"""
    parameters = {"amount": amount, "type": "boolean"}
    response = requests.get("https://opentdb.com/api.php", params=parameters)
    response.raise_for_status()
    data = response.json()
    return data["results"]

def create_quiz():
    """Create a new QuizBrain instance with fresh questions"""
    question_data = fetch_questions()
    question_bank = [
        Question(q["question"], q["correct_answer"])
        for q in question_data
    ]
    return QuizBrain(question_bank)

# Initialize a single quiz instance
quiz = create_quiz()

@app.get("/")
def root():
    return {"status": "Backend running"}

@app.get("/api/question")
def get_question():
    if quiz.still_has_questions():
        # Only return question text and number, not the correct answer
        q = quiz.next_question()
        return {
            "number": q["number"],
            "question": q["question"]
        }
    return {"message": "Quiz finished"}

@app.post("/api/answer")
def submit_answer(answer: str):
    # Check the user's answer and return result + score
    return quiz.check_answer(answer)

@app.post("/api/restart")
def restart_quiz():
    """Reset quiz and return the first question immediately"""
    global quiz
    quiz.reset()
    quiz.question_list = [
        Question(q["question"], q["correct_answer"])
        for q in fetch_questions()
    ]
    first_q = quiz.next_question()
    return {
        "message": "Quiz restarted",
        "number": first_q["number"],
        "question": first_q["question"]
    }
