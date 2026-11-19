// BacaMudah: demo satu klik untuk juri dan pengunjung baru.
// Alur: contoh materi -> hasil Teks Sederhana -> dengarkan sambil melihat sorotan -> kuis.
// Hasil dan kuis demo sudah disiapkan (dibuat sekali dengan Gemini), jadi langsung tampil.
(function () {
  "use strict";

  const demoButton = document.getElementById("demo-btn");
  const guide = document.getElementById("demo-guide");
  const beforeText = document.getElementById("demo-before");
  const afterText = document.getElementById("demo-after");
  const beforeStat = document.getElementById("demo-before-stat");
  const afterStat = document.getElementById("demo-after-stat");
  const listenButton = document.getElementById("demo-listen");
  const quizButton = document.getElementById("demo-quiz");
  const listenStep = document.getElementById("demo-step-listen");
  const quizStep = document.getElementById("demo-step-quiz");

  const demo = JSON.parse(document.getElementById("demo-data").textContent);
  const source = JSON.parse(document.getElementById("sample-data").textContent).trim();
  let demoIsShowing = false;

  // ----- Perbandingan sebelum dan sesudah -----
  function plainText(text) {
    return text.replace(/\*\*/g, "");
  }

  // Paragraf yang berisi kalimat (judul seperti "Siklus Hidrologi" dilewati).
  function paragraphsOf(text) {
    return text.split(/\n\s*\n/).map(function (part) { return part.trim(); }).filter(function (part) {
      return /[.!?]/.test(part);
    });
  }

  function averageWordsPerSentence(text) {
    const sentences = plainText(text).replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) || [];
    const words = sentences.reduce(function (sum, sentence) {
      return sum + sentence.trim().split(" ").length;
    }, 0);
    return sentences.length ? Math.round(words / sentences.length) : 0;
  }

  // Istilah bertanda **...** ditampilkan tebal (dibuat dengan DOM, bukan innerHTML).
  function fillWithTerms(element, text) {
    element.replaceChildren();
    text.split(/\*\*([^*]+)\*\*/).forEach(function (part, index) {
      if (!part) return;
      if (index % 2 === 1) {
        const term = document.createElement("strong");
        term.className = "compare-term";
        term.textContent = part;
        element.append(term);
      } else {
        element.append(part);
      }
    });
    window.BacaMudahSettings.addBionicMarks(element);
  }

  // Kalimat pertama materi asli (satu kalimat panjang) dibandingkan dengan
  // paragraf pertama hasil, yang membahas isi yang sama dengan kalimat pendek.
  function firstSentence(text) {
    const match = text.match(/^[^.!?]+[.!?]+/);
    return match ? match[0] : text;
  }

  function fillComparison() {
    fillWithTerms(beforeText, firstSentence(paragraphsOf(source)[0]));
    fillWithTerms(afterText, paragraphsOf(demo.result)[0]);
    const termCount = (demo.result.match(/\*\*[^*]+\*\*/g) || []).length;
    beforeStat.textContent = "Seluruh materi: rata-rata " + averageWordsPerSentence(source) + " kata per kalimat.";
    afterStat.textContent = "Seluruh hasil: rata-rata " + averageWordsPerSentence(demo.result) +
      " kata per kalimat, " + termCount + " istilah penting ditandai.";
  }

  // ----- Langkah demo -----
  function setStep(step, number, done) {
    step.classList.toggle("is-done", done);
    step.querySelector(".demo-check").textContent = done ? "✓" : String(number);
  }

  function openDemo() {
    window.BacaMudah.openStoredResult(
      { id: "demo", source: source, mode: demo.mode, result: demo.result },
      {
        demo: true,
        demoQuiz: demo.questions,
        statusText: "Demo siap. Lihat perbandingannya, lalu dengarkan dan kerjakan kuisnya.",
      }
    );
  }

  function listen() {
    const controls = document.getElementById("tts-controls");
    const playButton = document.getElementById("tts-play");
    if (!controls.hidden && !playButton.disabled && playButton.dataset.state !== "playing") {
      playButton.click(); // tts.js membacakan hasil dan menyorot kalimat yang sedang dibaca
    }
    setStep(listenStep, 3, true);
    // Tampilkan tombol baca nyaring dan awal teks hasil, tempat sorotan kalimat terlihat.
    window.BacaMudah.scrollToElement(controls.hidden ? document.getElementById("result-output") : controls);
  }

  function startQuiz() {
    document.getElementById("quiz-btn").click(); // quiz.js memakai soal demo yang sudah disiapkan
    setStep(quizStep, 4, true);
  }

  // Panduan hanya tampil selama hasil demo yang tampil dan materinya belum diubah.
  function handleResult(event) {
    demoIsShowing = event.detail.demo;
    guide.hidden = !demoIsShowing;
    if (demoIsShowing) {
      setStep(listenStep, 3, false);
      setStep(quizStep, 4, false);
    }
  }

  function handleStale(event) {
    guide.hidden = !demoIsShowing || event.detail.stale;
  }

  fillComparison();
  demoButton.addEventListener("click", openDemo);
  listenButton.addEventListener("click", listen);
  quizButton.addEventListener("click", startQuiz);
  document.addEventListener("bacamudah:result", handleResult);
  document.addEventListener("bacamudah:stale", handleStale);
})();
