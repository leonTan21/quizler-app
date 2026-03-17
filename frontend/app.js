let currentQuestion = null;
let totalQuestions = 10; // default, will be updated
let currentNumQuestions = 10;
let currentQuestionType = "boolean";

// Start the quiz with user parameters
async function startQuiz() {
  const numQuestions = document.getElementById("numQuestions").value;
  const questionType = document.getElementById("questionType").value;

  currentNumQuestions = numQuestions;
  currentQuestionType = questionType;

  try {
    const res = await fetch(`http://127.0.0.1:8000/api/start?amount=${numQuestions}&q_type=${questionType}`, { method: "POST" });
    const data = await res.json();

    // Update total questions for progress
    totalQuestions = parseInt(numQuestions);

    // Set current question
    currentQuestion = {
      number: data.number,
      question: data.question
    };

    // Hide start screen, show quiz screen
    document.getElementById("startScreen").style.display = "none";
    document.getElementById("quizScreen").style.display = "block";

    // Update UI
    document.getElementById("question").innerText = `Q${data.number}: ${data.question}`;
    document.getElementById("feedback").innerText = "";
    document.getElementById("score").innerText = "Score: 0";
    document.getElementById("progressBar").style.width = "0%";

    // Enable buttons
    document.getElementById("trueBtn").disabled = false;
    document.getElementById("falseBtn").disabled = false;
    document.getElementById("restartBtn").style.display = "none";

  } catch (err) {
    console.error("Failed to start quiz:", err);
    alert("Failed to start quiz. Please try again.");
  }
}

// Load a question from the backend
async function loadQuestion() {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/question");
    const data = await res.json();

    if (data.message) {
      document.getElementById("question").innerText = "🎉 Quiz finished!";
      document.getElementById("trueBtn").disabled = true;
      document.getElementById("falseBtn").disabled = true;
      document.getElementById("restartBtn").style.display = "inline-block";
      return;
    }

    currentQuestion = data;

    document.getElementById("question").innerText =
      `Q${data.number}: ${data.question}`;

    document.getElementById("feedback").innerText = "";

    /* UPDATE PROGRESS BAR */
    const progressPercent = (data.number / totalQuestions) * 100;
    document.getElementById("progressBar").style.width =
      progressPercent + "%";

    document.getElementById("trueBtn").disabled = false;
    document.getElementById("falseBtn").disabled = false;

  } catch (err) {
    console.error("Failed to load question:", err);
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
  // Hide quiz screen, show start screen
  document.getElementById("quizScreen").style.display = "none";
  document.getElementById("startScreen").style.display = "block";

  // Set inputs to previous values
  document.getElementById("numQuestions").value = currentNumQuestions;
  document.getElementById("questionType").value = currentQuestionType;
}

// Hook buttons to functions
document.getElementById("trueBtn").addEventListener("click", () => submitAnswer("True"));
document.getElementById("falseBtn").addEventListener("click", () => submitAnswer("False"));
document.getElementById("restartBtn").addEventListener("click", restartQuiz);
document.getElementById("startBtn").addEventListener("click", startQuiz);

// No initial loadQuestion, wait for start
