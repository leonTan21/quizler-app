class Question:

    def __init__(self, q_text, q_answer, q_options=None, q_metadata=None):
        self.text = q_text
        self.answer = q_answer
        self.options = q_options      # list for MCQ, None for boolean/jeopardy
        self.metadata = q_metadata or {}  # extra data e.g. {"category": "HISTORY"}
