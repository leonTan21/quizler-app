import html
import re


def _normalize(s: str) -> str:
    """Normalise a string for fuzzy Jeopardy answer matching."""
    s = html.unescape(s.lower().strip())
    s = re.sub(r"<[^>]+>", "", s)           # strip HTML tags
    s = re.sub(r"\([^)]+\)", "", s)          # strip parenthetical hints
    s = re.sub(r"^(a |an |the )\b", "", s.strip())  # strip leading articles
    s = re.sub(r"[^\w\s]", "", s)            # strip punctuation
    return s.strip()


class QuizBrain:

    def __init__(self, q_list, fuzzy=False):
        self.question_number = 0
        self.score = 0
        self.question_list = q_list
        self.current_question = None
        self._answered = False
        self.fuzzy = fuzzy

    def still_has_questions(self):
        return self.question_number < len(self.question_list)

    def load_next_question(self):
        """Advance to the next question and return it as a dict."""
        if not self.still_has_questions():
            return None
        self.current_question = self.question_list[self.question_number]
        self.question_number += 1
        self._answered = False
        return self._serialize_current()

    def get_current_question(self):
        """Return the current question without mutating state (idempotent)."""
        if self.current_question is None:
            return None
        return self._serialize_current()

    def _serialize_current(self):
        result = {
            "number": self.question_number,
            "question": html.unescape(self.current_question.text),
        }
        if self.current_question.options:
            result["options"] = [html.unescape(o) for o in self.current_question.options]
        if self.current_question.metadata:
            result["metadata"] = self.current_question.metadata
        return result

    def check_answer(self, user_answer):
        """Check the user's answer, update score, and return result."""
        if self.current_question is None:
            raise ValueError("No active question to answer.")
        if self._answered:
            raise ValueError("Current question has already been answered.")
        correct_answer = self.current_question.answer
        if self.fuzzy:
            is_correct = _normalize(user_answer) == _normalize(correct_answer)
        else:
            is_correct = user_answer.lower() == correct_answer.lower()
        if is_correct:
            self.score += 1
        self._answered = True
        return {
            "correct": is_correct,
            "correct_answer": html.unescape(correct_answer),
            "score": self.score,
        }
