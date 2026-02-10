from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from question_model import Question
from quiz_brain import QuizBrain
import requests

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def fetch_questions():
    parameters = {"amount": 10, "type": "boolean"}
    response = requests.get("https://opentdb.com/api.php", params=parameters)
    response.raise_for_status()
    data = response.json()
    return data["results"]

def create_quiz():
    question_data = fetch_questions()  # fetch fresh questions
    question_bank = [
        Question(q["question"], q["correct_answer"])
        for q in question_data
    ]
    return QuizBrain(question_bank)

quiz = create_quiz()

@app.get("/")
def root():
    return {"status": "Backend running"}

@app.get("/api/question")
def get_question():
    if quiz.still_has_questions():
        return quiz.next_question()
    return {"message": "Quiz finished"}

@app.post("/api/answer")
def submit_answer(answer: str):
    return quiz.check_answer(answer)

@app.post("/api/restart")
def restart_quiz():
    global quiz
    quiz = create_quiz()  # new QuizBrain with fresh questions
    return {"message": "Quiz restarted"}
