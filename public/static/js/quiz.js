// BacaMudah: kuis pemahaman dari AI. Satu soal per layar, umpan balik langsung, lalu skor akhir.
(function () {
  "use strict";

  const LETTERS = ["A", "B", "C", "D"];

  const quizButton = document.getElementById("quiz-btn");
  const section = document.getElementById("quiz-section");
  const heading = document.getElementById("judul-kuis");
  const status = document.getElementById("quiz-status");
  const errorBox = document.getElementById("quiz-error");
  const errorText = document.getElementById("quiz-error-text");
  const retryButton = document.getElementById("quiz-retry-btn");
  const body = document.getElementById("quiz-body");

  let sourceText = ""; // materi dari hasil yang sedang tampil
  let questions = [];
  let current = 0; // indeks soal yang sedang tampil
  let score = 0;
  let isLoading = false;
  let requestId = 0; // naik tiap permintaan, untuk mengabaikan jawaban dari materi lama

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createButton(className, text, onClick) {
    const button = createElement("button", className, text);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  // ----- Meminta kuis ke server -----
  async function loadQuiz() {
    if (isLoading || !sourceText) return;
    requestId += 1;
    const myRequest = requestId;

    isLoading = true;
    quizButton.disabled = true;
    section.hidden = false;
    errorBox.hidden = true;
    body.replaceChildren();
    window.BacaMudah.showLoading(status, "Sedang membuat kuis. Biasanya kurang dari 15 detik.");
    window.BacaMudah.scrollToElement(heading);

    try {
      const data = await window.BacaMudah.requestJson("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText }),
      });
      if (myRequest !== requestId) return; // materi sudah diganti saat menunggu
      questions = data.questions;
      status.textContent = "";
      startQuiz();
    } catch (error) {
      if (myRequest !== requestId) return;
      status.textContent = "";
      errorText.textContent = error.message;
      errorBox.hidden = false;
      retryButton.focus();
    } finally {
      if (myRequest === requestId) {
        isLoading = false;
        quizButton.disabled = false;
      }
    }
  }

  // ----- Mengerjakan kuis -----
  function startQuiz() {
    current = 0;
    score = 0;
    renderQuestion();
  }

  function renderQuestion() {
    const item = questions[current];
    const progress = createElement("p", "quiz-progress", "Soal " + (current + 1) + " dari " + questions.length);
    const question = createElement("p", "quiz-question", item.question);
    question.id = "quiz-question";
    question.tabIndex = -1;

    const options = createElement("div", "quiz-options");
    options.setAttribute("role", "group");
    options.setAttribute("aria-labelledby", "quiz-question");
    item.options.forEach(function (optionText, index) {
      const button = createButton("quiz-option", undefined, function () { answer(index); });
      button.append(createElement("span", "quiz-letter", LETTERS[index]), createElement("span", "quiz-text", optionText));
      // Label untuk pembaca layar, agar huruf dan teks pilihan tidak terbaca menempel.
      button.setAttribute("aria-label", LETTERS[index] + ". " + optionText);
      options.append(button);
    });

    // Area umpan balik dibuat kosong lebih dulu agar isinya dibacakan pembaca layar saat muncul.
    const feedback = createElement("div", "quiz-feedback");
    feedback.setAttribute("aria-live", "polite");

    body.replaceChildren(progress, question, options, feedback);
    question.focus();
  }

  function answer(chosenIndex) {
    const item = questions[current];
    const isCorrect = chosenIndex === item.answer_index;
    if (isCorrect) score += 1;

    // Kunci semua pilihan, lalu tandai yang benar dan (jika salah) yang dipilih.
    body.querySelectorAll(".quiz-option").forEach(function (button, index) {
      button.disabled = true;
      if (index !== item.answer_index && index !== chosenIndex) return;
      const isAnswer = index === item.answer_index;
      const mark = createElement("span", "quiz-mark", isAnswer ? "✓" : "✗");
      mark.setAttribute("aria-hidden", "true");
      button.classList.add(isAnswer ? "is-correct" : "is-wrong");
      button.querySelector(".quiz-text").append(" ", mark);
      button.setAttribute(
        "aria-label",
        button.getAttribute("aria-label") + (isAnswer ? " (jawaban benar)" : " (pilihanmu, belum tepat)")
      );
    });

    const verdict = isCorrect
      ? "Benar!"
      : "Belum tepat. Jawaban yang benar: " + LETTERS[item.answer_index] + ". " + item.options[item.answer_index];
    body.querySelector(".quiz-feedback").append(
      createElement("p", "quiz-verdict " + (isCorrect ? "is-correct" : "is-wrong"), verdict),
      createElement("p", "quiz-explanation", item.explanation)
    );

    const isLast = current === questions.length - 1;
    const nextButton = createButton("btn btn-primary", isLast ? "Lihat skor" : "Soal berikutnya", isLast ? showScore : nextQuestion);
    body.append(nextButton);
    nextButton.focus();
  }

  function nextQuestion() {
    current += 1;
    renderQuestion();
  }

  function scoreMessage() {
    if (score === questions.length) return "Hebat! Semua jawabanmu benar.";
    if (score * 2 >= questions.length) return "Bagus! Kamu sudah paham sebagian besar materinya.";
    return "Tidak apa-apa. Coba baca lagi hasilnya, lalu ulangi kuisnya.";
  }

  function showScore() {
    const title = createElement("p", "quiz-score", "Skor kamu: " + score + " dari " + questions.length);
    title.tabIndex = -1;
    body.replaceChildren(
      title,
      createElement("p", "quiz-explanation", scoreMessage()),
      createButton("btn btn-secondary", "Ulangi kuis", startQuiz)
    );
    title.focus();
  }

  // Hasil baru berarti materinya berganti: simpan materinya dan buang kuis lama.
  function handleNewResult(event) {
    sourceText = event.detail.sourceText;
    requestId += 1;
    isLoading = false;
    quizButton.disabled = false;
    section.hidden = true;
    errorBox.hidden = true;
    status.textContent = "";
    body.replaceChildren();
  }

  quizButton.addEventListener("click", loadQuiz);
  retryButton.addEventListener("click", loadQuiz);
  document.addEventListener("bacamudah:result", handleNewResult); // dikirim app.js saat hasil baru tampil
})();
