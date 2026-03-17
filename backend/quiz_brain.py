import html

class QuizBrain:

    def __init__(self, q_list):
        self.question_number = 0
        self.score = 0
        self.question_list = q_list
        self.current_question = None

    def still_has_questions(self):
        return self.question_number < len(self.question_list)

    def next_question(self):
        """Return current question as a dict for API"""
        self.current_question = self.question_list[self.question_number]
        self.question_number += 1

        return {
            "number": self.question_number,
            "question": html.unescape(self.current_question.text),
            # "answer": self.current_question.answer  # optional, not sent to frontend
        }

    def check_answer(self, user_answer):
        """Check the user's answer and update score"""
        correct_answer = self.current_question.answer
        is_correct = user_answer.lower() == correct_answer.lower()
        if is_correct:
            self.score += 1
        return {
            "correct": is_correct,
            "score": self.score
        }

    def reset(self):
        """Reset quiz state"""
        self.question_number = 0
        self.score = 0
        self.current_question = None

    