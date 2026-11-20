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
  let preparedQuestions = null; // soal demo yang sudah disiapkan, jadi tidak perlu memanggil AI
  let allQuestions = []; // semua soal kuis untuk materi ini
  let questions = []; // soal di putaran ini: semua soal, atau hanya yang tadi salah
  let isReview = false; // true saat mengulang soal yang salah saja
  let wrongQuestions = []; // soal yang dijawab salah di putaran ini
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
    if (preparedQuestions) {
      section.hidden = false;
      errorBox.hidden = true;
      status.textContent = "";
      allQuestions = preparedQuestions;
      startQuiz(allQuestions, false);
      window.BacaMudah.scrollToElement(heading);
      return;
    }
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
      allQuestions = data.questions;
      status.textContent = "";
      startQuiz(allQuestions, false);
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
  // Mulai satu putaran. review = true berarti hanya mengulang soal yang tadi salah.
  function startQuiz(list, review) {
    questions = list;
    isReview = review;
    wrongQuestions = [];
    current = 0;
    score = 0;
    renderQuestion();
  }

  // Bilah kemajuan: terisi sesuai jumlah soal yang sudah dijawab.
  function createProgress() {
    const top = createElement("div", "quiz-top");
    const bar = createElement("div", "quiz-bar");
    bar.setAttribute("aria-hidden", "true"); // angka "Soal x dari y" sudah cukup untuk pembaca layar
    bar.append(createElement("span", "quiz-bar-fill"));
    const label = (isReview ? "Ulang soal " : "Soal ") + (current + 1) + " dari " + questions.length;
    top.append(bar, createElement("p", "quiz-progress", label));
    return top;
  }

  function setProgress(answeredCount) {
    body.querySelector(".quiz-bar-fill").style.width = (answeredCount / questions.length) * 100 + "%";
  }

  function renderQuestion() {
    const item = questions[current];
    const progress = createProgress();
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
    // Panel pembungkusnya baru berwarna setelah soal dijawab.
    const panel = createElement("div", "quiz-panel");
    const feedback = createElement("div", "quiz-feedback");
    feedback.setAttribute("aria-live", "polite");
    panel.append(feedback);

    body.replaceChildren(progress, question, options, panel);
    window.BacaMudahSettings.addBionicMarks(body);
    setProgress(current);
    question.focus();
  }

  function answer(chosenIndex) {
    const item = questions[current];
    const isCorrect = chosenIndex === item.answer_index;
    if (isCorrect) score += 1;
    else wrongQuestions.push(item);

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

    const verdict = createElement("p", "quiz-verdict");
    const verdictIcon = createElement("span", "quiz-mark", isCorrect ? "✓" : "✗");
    verdictIcon.setAttribute("aria-hidden", "true");
    verdict.append(verdictIcon, " " + (isCorrect ? "Benar, hebat!" : "Belum tepat."));

    const feedbackItems = [verdict];
    if (!isCorrect) {
      const correctText = LETTERS[item.answer_index] + ". " + item.options[item.answer_index];
      feedbackItems.push(createElement("p", "quiz-answer", "Jawaban yang benar: " + correctText));
    }
    feedbackItems.push(createElement("p", "quiz-explanation", item.explanation));

    const panel = body.querySelector(".quiz-panel");
    panel.classList.add(isCorrect ? "is-correct" : "is-wrong");
    panel.querySelector(".quiz-feedback").append(...feedbackItems);
    window.BacaMudahSettings.addBionicMarks(panel);
    setProgress(current + 1);

    // Tombol lanjut berada di luar area aria-live agar tidak ikut dibacakan dua kali.
    const isLast = current === questions.length - 1;
    const nextButton = createButton(
      "btn " + (isCorrect ? "btn-success" : "btn-danger"),
      isLast ? "Lihat skor" : "Soal berikutnya",
      isLast ? showScore : nextQuestion
    );
    panel.append(nextButton);
    nextButton.focus();
  }

  function nextQuestion() {
    current += 1;
    renderQuestion();
  }

  function scoreMessage() {
    const allCorrect = score === questions.length;
    if (isReview) {
      return allCorrect
        ? "Hebat! Soal yang tadi salah sekarang sudah benar semua."
        : "Masih ada yang belum tepat. Baca lagi penjelasannya, lalu coba sekali lagi.";
    }
    if (allCorrect) return "Hebat! Semua jawabanmu benar.";
    if (score * 2 >= questions.length) return "Bagus! Kamu sudah paham sebagian besar materinya.";
    return "Tidak apa-apa. Coba baca lagi hasilnya, lalu ulangi soal yang salah.";
  }

  // Jika ada yang salah, tawarkan mengulang soal itu saja. Selalu ada pilihan mengulang semua soal.
  function createScoreActions() {
    const actions = createElement("div", "toolbar quiz-result-actions");
    const wrongList = wrongQuestions.slice();
    if (wrongList.length > 0) {
      actions.append(
        createButton("btn btn-primary", "Ulangi " + wrongList.length + " soal yang salah", function () {
          startQuiz(wrongList, true);
        }),
        createButton("btn btn-secondary", "Ulangi semua soal", function () {
          startQuiz(allQuestions, false);
        })
      );
    } else {
      actions.append(createButton("btn btn-primary", "Ulangi kuis", function () {
        startQuiz(allQuestions, false);
      }));
    }
    return actions;
  }

  function showScore() {
    // Lencana angka besar hanya hiasan; kalimat skor di bawahnya yang dibacakan.
    const badge = createElement("div", "quiz-score-badge");
    badge.setAttribute("aria-hidden", "true");
    badge.append(createElement("strong", "", String(score)), "dari " + questions.length);

    const titleText = isReview
      ? "Hasil ulangan: " + score + " dari " + questions.length + " soal benar"
      : "Skor kamu: " + score + " dari " + questions.length;
    const title = createElement("p", "quiz-score", titleText);
    title.tabIndex = -1;

    const result = createElement("div", "quiz-result");
    result.append(
      badge,
      title,
      createElement("p", "quiz-explanation", scoreMessage()),
      createScoreActions()
    );
    body.replaceChildren(result);
    window.BacaMudahSettings.addBionicMarks(result);
    title.focus();
    // history.js menyimpan skor ini bersama materi di riwayat. Putaran ulangan tidak
    // disimpan, karena skornya hanya dari sebagian soal.
    if (isReview) return;
    document.dispatchEvent(new CustomEvent("bacamudah:quizdone", {
      detail: { score: score, total: questions.length },
    }));
  }

  // Buang kuis yang sedang tampil, termasuk permintaan kuis yang belum selesai.
  function resetQuiz() {
    requestId += 1;
    isLoading = false;
    section.hidden = true;
    errorBox.hidden = true;
    status.textContent = "";
    body.replaceChildren();
  }

  // Hasil baru berarti materinya berganti: simpan materinya dan buang kuis lama.
  function handleNewResult(event) {
    sourceText = event.detail.sourceText;
    preparedQuestions = event.detail.demoQuiz;
    resetQuiz();
    quizButton.disabled = false;
  }

  // Materi diubah setelah hasil tampil: kuis lama tidak lagi sesuai dengan materi di layar.
  function handleStale(event) {
    if (!sourceText) return;
    if (event.detail.stale) resetQuiz();
    quizButton.disabled = event.detail.stale;
  }

  quizButton.addEventListener("click", loadQuiz);
  retryButton.addEventListener("click", loadQuiz);
  document.addEventListener("bacamudah:result", handleNewResult); // dikirim app.js saat hasil baru tampil
  document.addEventListener("bacamudah:stale", handleStale); // dikirim app.js saat materi berubah
})();
