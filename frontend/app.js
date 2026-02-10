let currentQuestion = null;

async function loadQuestion() {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/question");
    const data = await res.json();

    if (data.message) {
      // Quiz finished
      document.getElementById("question").innerText = data.message;
      document.getElementById("trueBtn").disabled = true;
      document.getElementById("falseBtn").disabled = true;
      document.getElementById("restartBtn").style.display = "inline-block";
      return;
    }

    // Update current question
    currentQuestion = data;
    document.getElementById("question").innerText = `Q${data.number}: ${data.question}`;
    document.getElementById("feedback").innerText = "";

    // Ensure buttons are enabled
    document.getElementById("trueBtn").disabled = false;
    document.getElementById("falseBtn").disabled = false;

  } catch (err) {
    console.error("Failed to load question:", err);
    document.getElementById("question").innerText = "Error loading question!";
  }
}

async function submitAnswer(answer) {
  document.getElementById("trueBtn").disabled = true;
  document.getElementById("falseBtn").disabled = true;

  const res = await fetch(
    `http://127.0.0.1:8000/api/answer?answer=${encodeURIComponent(answer)}`,
    { method: "POST" }
  );

  const data = await res.json();

  document.getElementById("feedback").innerText =
    data.correct ? "✅ Correct!" : "❌ Wrong!";
  document.getElementById("score").innerText = `Score: ${data.score}`;

  // Load next question and re-enable buttons
  setTimeout(() => {
    loadQuestion();
    document.getElementById("trueBtn").disabled = false;
    document.getElementById("falseBtn").disabled = false;
  }, 1000);
}

async function restartQuiz() {
  try {
    // Reset backend
    await fetch("http://127.0.0.1:8000/api/restart", { method: "POST" });

    // Reset frontend
    document.getElementById("restartBtn").style.display = "none";
    document.getElementById("score").innerText = "Score: 0";
    document.getElementById("feedback").innerText = "";
    document.getElementById("trueBtn").disabled = false;
    document.getElementById("falseBtn").disabled = false;

    // Clear currentQuestion
    currentQuestion = null;

    // Force load the **first question**
    loadQuestion();
  } catch (err) {
    console.error("Failed to restart quiz:", err);
  }
}

loadQuestion();
