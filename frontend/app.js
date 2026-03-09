let currentQuestion = null;

// Load a question from the backend
async function loadQuestion() {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/question");
    const data = await res.json();

    if (data.message) {
      // Quiz finished
      document.getElementById("question").innerText = "🎉 Quiz finished!";
      document.getElementById("feedback").innerText = "";
      document.getElementById("trueBtn").disabled = true;
      document.getElementById("falseBtn").disabled = true;
      document.getElementById("restartBtn").style.display = "inline-block";
      return;
    }

    // Update current question
    currentQuestion = data;
    document.getElementById("question").innerText = `Q${data.number}: ${data.question}`;
    document.getElementById("feedback").innerText = "";

    // Enable buttons
    document.getElementById("trueBtn").disabled = false;
    document.getElementById("falseBtn").disabled = false;
    document.getElementById("restartBtn").style.display = "none";

  } catch (err) {
    console.error("Failed to load question:", err);
    document.getElementById("question").innerText = "Error loading question!";
  }
}

// Submit the user's answer
async function submitAnswer(answer) {
  // Disable buttons to prevent double click
  document.getElementById("trueBtn").disabled = true;
  document.getElementById("falseBtn").disabled = true;

  try {
    const res = await fetch(
      `http://127.0.0.1:8000/api/answer?answer=${encodeURIComponent(answer)}`,
      { method: "POST" }
    );
    const data = await res.json();

    document.getElementById("feedback").innerText =
      data.correct ? "✅ Correct!" : "❌ Wrong!";
    document.getElementById("score").innerText = `Score: ${data.score}`;

    // Load next question after short delay
    setTimeout(() => {
      loadQuestion();
    }, 1000);

  } catch (err) {
    console.error("Failed to submit answer:", err);
    document.getElementById("feedback").innerText = "Error submitting answer!";
  }
}

// Restart the quiz
async function restartQuiz() {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/restart", { method: "POST" });
    const data = await res.json();

    // Update frontend with the first question
    currentQuestion = {
      number: data.number,
      question: data.question
    };

    document.getElementById("question").innerText = `Q${data.number}: ${data.question}`;
    document.getElementById("feedback").innerText = "";
    document.getElementById("score").innerText = "Score: 0";

    // Enable buttons and hide restart button
    document.getElementById("trueBtn").disabled = false;
    document.getElementById("falseBtn").disabled = false;
    document.getElementById("restartBtn").style.display = "none";

  } catch (err) {
    console.error("Failed to restart quiz:", err);
    document.getElementById("question").innerText = "Error restarting quiz!";
  }
}

// Hook buttons to functions
document.getElementById("trueBtn").addEventListener("click", () => submitAnswer("True"));
document.getElementById("falseBtn").addEventListener("click", () => submitAnswer("False"));
document.getElementById("restartBtn").addEventListener("click", restartQuiz);

// Load the first question on page load
loadQuestion();
