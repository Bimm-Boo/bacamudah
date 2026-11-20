// BacaMudah: input materi, unggah PDF, proses AI, serta salin dan unduh hasil.
(function () {
  "use strict";

  const REQUEST_TIMEOUT_MS = 90000; // 90 detik, termasuk saat server baru "bangun"
  const LABELED_MODES = ["analogi", "istilah"]; // mode yang barisnya berformat "Label: isi"
  const MAX_SENTENCES_PER_PARAGRAPH = 3; // paragraf yang lebih panjang dipecah agar mudah dipindai

  const textInput = document.getElementById("input-text");
  const charCount = document.getElementById("char-count");
  const limitWarning = document.getElementById("limit-warning");
  const inputMessage = document.getElementById("input-message");
  const sampleButton = document.getElementById("sample-btn");
  const pdfInput = document.getElementById("pdf-file");
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const processButton = document.getElementById("process-btn");
  const processHint = document.getElementById("process-hint");
  const staleNotice = document.getElementById("result-stale");
  const resultHeading = document.getElementById("judul-hasil");
  const resultStatus = document.getElementById("result-status");
  const resultError = document.getElementById("result-error");
  const resultErrorText = document.getElementById("result-error-text");
  const retryButton = document.getElementById("retry-btn");
  const resultOutput = document.getElementById("result-output");
  const sourceCompare = document.getElementById("source-compare");
  const sourceOutput = document.getElementById("source-output");
  const copyButton = document.getElementById("copy-btn");
  const downloadButton = document.getElementById("download-btn");
  const pdfButton = document.getElementById("pdf-btn");

  const maxChars = Number(textInput.dataset.maxChars);
  const maxPdfMb = Number(pdfInput.dataset.maxMb); // batasnya ditentukan di app.py
  let isProcessing = false;
  let activeSource = "teks"; // tab yang sedang terbuka: "teks" atau "pdf"
  let lastResult = ""; // teks hasil terakhir, dipakai tombol Salin dan Unduh
  let lastMode = "";
  let lastSourceText = ""; // materi yang menghasilkan hasil terakhir
  let isStale = false; // true jika materi atau sumbernya sudah berubah sejak hasil terakhir

  function formatNumber(value) {
    return value.toLocaleString("id-ID");
  }

  // ----- Pesan di bawah kartu input -----
  function showInputMessage(text, type) {
    inputMessage.textContent = text;
    inputMessage.className = "message" + (type ? " message-" + type : "");
    inputMessage.hidden = false;
  }

  function hideInputMessage() {
    inputMessage.hidden = true;
    inputMessage.textContent = "";
  }

  // ----- Penghitung karakter dan status tombol Proses -----
  function updateInputState() {
    const length = textInput.value.length;
    const isOverLimit = length > maxChars;

    charCount.textContent = formatNumber(length) + " / " + formatNumber(maxChars) + " karakter";
    charCount.classList.toggle("over-limit", isOverLimit);

    limitWarning.hidden = !isOverLimit;
    limitWarning.textContent = isOverLimit
      ? "Teks terlalu panjang. Hapus " + formatNumber(length - maxChars) + " karakter agar bisa diproses."
      : "";

    const isEmpty = textInput.value.trim() === "";
    const onPdfTab = activeSource === "pdf";
    // Di tab PDF, tombol Proses menunggu PDF dipilih; teks di tab lain tidak ikut diproses.
    processButton.disabled = isProcessing || onPdfTab || isOverLimit || isEmpty;
    processHint.textContent = processHintText(onPdfTab, isEmpty, isOverLimit);
    processHint.hidden = processHint.textContent === "";
    updateStaleState();
  }

  // Penjelasan di bawah tombol Proses saat tombol belum bisa ditekan.
  function processHintText(onPdfTab, isEmpty, isOverLimit) {
    if (isProcessing) return "";
    if (onPdfTab) return "Pilih file PDF dulu. Teksnya akan muncul di kolom teks untuk dicek sebelum diproses.";
    if (isEmpty) return "Tempel materi dulu, atau tekan Coba contoh materi.";
    if (isOverLimit) return "Persingkat teksnya dulu agar bisa diproses.";
    return "";
  }

  // ----- Hasil lama: tandai jika materi atau sumbernya sudah berubah -----
  function updateStaleState() {
    const stale = lastResult !== "" &&
      (activeSource !== "teks" || textInput.value.trim() !== lastSourceText);
    if (stale === isStale) return;
    isStale = stale;
    // Teks diisi saat muncul agar diumumkan pembaca layar (role="status").
    staleNotice.textContent = stale
      ? "Materi sudah berubah. Hasil di bawah masih dari materi sebelumnya. Tekan Proses untuk membuat hasil baru."
      : "";
    resultOutput.classList.toggle("is-stale", stale);
    if (stale && !isProcessing) resultStatus.textContent = "";
    // quiz.js menutup kuis lama dan menonaktifkan tombol Buat Kuis selama hasil sudah lama.
    document.dispatchEvent(new CustomEvent("bacamudah:stale", { detail: { stale: stale } }));
  }

  // ----- Tab Teks / PDF (bisa dengan klik atau tombol panah) -----
  function selectTab(selectedTab) {
    tabs.forEach(function (tab) {
      const isSelected = tab === selectedTab;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !isSelected;
    });
    const source = selectedTab.id === "tab-pdf" ? "pdf" : "teks";
    if (source !== activeSource) hideInputMessage(); // pesan lama milik sumber sebelumnya
    activeSource = source;
    updateInputState();
  }

  function handleTabKeydown(event) {
    const index = tabs.indexOf(event.currentTarget);
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    selectTab(tabs[nextIndex]);
    tabs[nextIndex].focus();
  }

  function showTextTab() {
    selectTab(tabs[0]);
    textInput.focus();
  }

  // ----- Permintaan ke server dengan batas waktu dan pesan ramah -----
  async function requestJson(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        // Kode 413 tanpa pesan berarti permintaan ditolak karena terlalu besar sebelum sampai ke aplikasi.
        const fallback = response.status === 413
          ? "Ukuran file terlalu besar. Pilih file yang lebih kecil."
          : "Terjadi kesalahan di server. Coba lagi sebentar lagi.";
        throw new Error(data.error || fallback);
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Proses terlalu lama. Coba lagi, atau persingkat materinya.");
      }
      if (error instanceof TypeError) {
        throw new Error("Tidak bisa terhubung ke server. Periksa koneksi internet kamu.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // ----- Contoh materi -----
  function fillSample() {
    textInput.value = JSON.parse(document.getElementById("sample-data").textContent);
    updateInputState();
    showInputMessage("Contoh materi sudah diisi. Pilih cara penyajian, lalu tekan Proses.", "success");
  }

  // ----- Unggah PDF -----
  async function handlePdfChange() {
    const file = pdfInput.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showInputMessage("File harus berformat PDF.", "error");
      pdfInput.value = "";
      return;
    }
    if (file.size > maxPdfMb * 1024 * 1024) {
      showInputMessage("Ukuran PDF maksimal " + maxPdfMb + " MB. Pilih file yang lebih kecil.", "error");
      pdfInput.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    pdfInput.disabled = true;
    showInputMessage("Sedang membaca PDF…");

    try {
      const data = await requestJson("/api/extract-pdf", { method: "POST", body: formData });
      textInput.value = data.text;
      updateInputState();
      showTextTab();
      showInputMessage(
        data.truncated
          ? "PDF terlalu panjang, jadi hanya " + formatNumber(maxChars) + " karakter pertama yang diambil. Cek teksnya sebelum diproses."
          : "Teks dari PDF berhasil diambil. Cek dan ubah bila perlu, lalu tekan Proses.",
        "success"
      );
    } catch (error) {
      showInputMessage(error.message, "error");
    } finally {
      pdfInput.disabled = false;
      pdfInput.value = "";
    }
  }

  // ----- Menampilkan hasil AI dengan aman (tanpa innerHTML) -----
  // Pecah satu baris menjadi kalimat: berakhir di . ! ? yang diikuti spasi.
  // Titik di dalam angka (misalnya 15.000) tidak memotong kalimat.
  function splitSentences(line) {
    return line.match(/\S.*?(?:[.!?]+["”’')\]]*(?=\s|$)|$)/g) || [line];
  }

  // AI menandai istilah penting dengan **istilah**. Tanda itu dibuang untuk Salin/Unduh.
  function plainText(text) {
    return text.replace(/\*\*/g, "");
  }

  // Teks di antara ** ditebalkan sebagai istilah penting (dibuat dengan DOM, bukan innerHTML).
  // Istilah berupa tombol: diketuk untuk melihat artinya (dictionary.js).
  function appendRichText(parent, text) {
    text.split(/\*\*([^*]+)\*\*/).forEach(function (part, index) {
      const clean = plainText(part); // buang sisa tanda yang tidak berpasangan
      if (!clean) return;
      if (index % 2 === 1) {
        const term = document.createElement("button");
        term.type = "button";
        term.className = "key-term";
        term.textContent = clean;
        term.setAttribute("aria-haspopup", "dialog");
        parent.append(term);
      } else {
        parent.append(clean);
      }
    });
  }

  // Tiap kalimat dibungkus <span class="sentence"> agar bisa disorot saat dibacakan.
  function createLine(tagName, sentences, useLabel) {
    const element = document.createElement(tagName);
    sentences.forEach(function (sentence, index) {
      const span = document.createElement("span");
      span.className = "sentence";
      const match = useLabel && index === 0 ? sentence.match(/^([^:]{1,60}):\s+(.+)$/) : null;
      if (match) {
        const label = document.createElement("strong");
        label.textContent = plainText(match[1]) + ":";
        span.append(label, " ");
        appendRichText(span, match[2]);
      } else {
        appendRichText(span, sentence);
      }
      if (index > 0) element.append(" ");
      element.append(span);
    });
    return element;
  }

  // Paragraf panjang dipecah per beberapa kalimat agar mudah dipindai.
  function createParagraphs(line, useLabel) {
    const sentences = splitSentences(line);
    const paragraphs = [];
    for (let start = 0; start < sentences.length; start += MAX_SENTENCES_PER_PARAGRAPH) {
      const group = sentences.slice(start, start + MAX_SENTENCES_PER_PARAGRAPH);
      paragraphs.push(createLine("p", group, useLabel && start === 0));
    }
    return paragraphs;
  }

  function renderResult(text, mode) {
    const useLabel = LABELED_MODES.includes(mode);
    resultOutput.replaceChildren();

    text.split(/\n\s*\n/).forEach(function (blockText) {
      const lines = blockText.split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
      if (lines.length === 0) return;

      const block = document.createElement("div");
      block.className = "result-block";
      let list = null;

      lines.forEach(function (line) {
        if (line.startsWith("- ")) {
          if (!list) {
            list = document.createElement("ul");
            block.append(list);
          }
          list.append(createLine("li", splitSentences(line.slice(2)), useLabel));
        } else {
          list = null;
          block.append(...createParagraphs(line, useLabel));
        }
      });
      resultOutput.append(block);
    });
    window.BacaMudahSettings.addBionicMarks(resultOutput);
  }

  // Materi asli ditampilkan apa adanya (per paragraf) di bawah hasil, untuk dicek ulang.
  function renderSource(text) {
    sourceOutput.replaceChildren();
    text.split(/\n\s*\n/).forEach(function (blockText) {
      const clean = blockText.trim();
      if (!clean) return;
      const paragraph = document.createElement("p");
      paragraph.textContent = clean;
      sourceOutput.append(paragraph);
    });
    window.BacaMudahSettings.addBionicMarks(sourceOutput);
    sourceCompare.hidden = false;
  }

  // Tampilkan hasil dan kabari file lain (tts.js, quiz.js, history.js, demo.js).
  // options: restoredId (dibuka dari riwayat), demo (hasil demo), demoQuiz (soal demo siap pakai).
  function showResult(text, mode, sourceText, options) {
    const extra = options || {};
    renderResult(text, mode);
    renderSource(sourceText);
    lastResult = text;
    lastMode = mode;
    lastSourceText = sourceText;
    copyButton.disabled = false;
    downloadButton.disabled = false;
    pdfButton.disabled = false;
    document.dispatchEvent(new CustomEvent("bacamudah:result", {
      detail: {
        sourceText: sourceText,
        mode: mode,
        result: text,
        restoredId: extra.restoredId || null,
        demo: Boolean(extra.demo),
        demoQuiz: extra.demoQuiz || null,
      },
    }));
  }

  // Buka hasil yang sudah ada (dari riwayat atau demo) tanpa memanggil AI lagi.
  function openStoredResult(entry, options) {
    const extra = options || {};
    if (isProcessing) return;
    document.dispatchEvent(new CustomEvent("bacamudah:processing")); // hentikan baca nyaring
    selectTab(tabs[0]);
    textInput.value = entry.source;
    const modeInput = document.querySelector('input[name="mode"][value="' + entry.mode + '"]');
    if (modeInput) modeInput.checked = true;
    hideInputMessage();
    resultError.hidden = true;
    showResult(entry.result, entry.mode, entry.source, {
      restoredId: extra.demo ? null : entry.id,
      demo: extra.demo,
      demoQuiz: extra.demoQuiz,
    });
    updateInputState();
    resultStatus.textContent = extra.statusText || "Hasil dari riwayat sudah dibuka.";
    scrollToElement(resultHeading);
    resultHeading.focus({ preventScroll: true });
  }

  // ----- Proses AI -----
  // Tampilkan ikon berputar dan pesan tunggu di sebuah area status.
  function showLoading(container, message) {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = message;
    container.replaceChildren(spinner, label);
  }

  // Gulir ke sebuah elemen; tanpa animasi jika pengguna memilih "kurangi gerakan".
  function scrollToElement(element) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function setProcessing(active) {
    isProcessing = active;
    processButton.textContent = active ? "Sedang memproses…" : "Proses";
    resultOutput.setAttribute("aria-busy", String(active));
    updateInputState();
  }

  async function processText() {
    const text = textInput.value.trim();
    const mode = document.querySelector('input[name="mode"]:checked').value;
    if (!text || isProcessing || activeSource !== "teks") return;

    setProcessing(true);
    hideInputMessage(); // pesan seperti "...lalu tekan Proses" sudah tidak relevan
    document.dispatchEvent(new CustomEvent("bacamudah:processing")); // tts.js berhenti membaca
    resultError.hidden = true;
    showLoading(resultStatus, "Sedang memproses materi. Biasanya kurang dari 15 detik.");
    scrollToElement(resultHeading);

    try {
      const data = await requestJson("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, mode: mode }),
      });
      showResult(data.result, mode, text);
      resultStatus.textContent = "Hasil sudah siap.";
      resultHeading.focus({ preventScroll: true });
    } catch (error) {
      resultStatus.textContent = "";
      resultErrorText.textContent = error.message;
      resultError.hidden = false;
      retryButton.focus();
    } finally {
      setProcessing(false);
    }
  }

  // ----- Salin dan unduh hasil -----
  async function copyResult() {
    try {
      await navigator.clipboard.writeText(plainText(lastResult));
      resultStatus.textContent = "Hasil sudah disalin.";
    } catch (error) {
      resultStatus.textContent = "Tidak bisa menyalin otomatis. Blok teks hasilnya, lalu salin secara manual.";
    }
  }

  function downloadResult() {
    // Baris baru gaya Windows (CRLF) agar rapi juga saat dibuka di Notepad.
    const content = plainText(lastResult).replace(/\n/g, "\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "bacamudah-" + lastMode + ".txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    resultStatus.textContent = "File .txt sedang diunduh.";
  }

  // ----- Pasang semua event -----
  textInput.addEventListener("input", function () {
    hideInputMessage();
    updateInputState();
  });
  sampleButton.addEventListener("click", fillSample);
  pdfInput.addEventListener("change", handlePdfChange);
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { selectTab(tab); });
    tab.addEventListener("keydown", handleTabKeydown);
  });
  processButton.addEventListener("click", processText);
  retryButton.addEventListener("click", processText);
  copyButton.addEventListener("click", copyResult);
  downloadButton.addEventListener("click", downloadResult);

  // Fungsi yang juga dipakai file lain (quiz.js, dictionary.js, history.js, pdf-export.js).
  window.BacaMudah = {
    requestJson: requestJson,
    showLoading: showLoading,
    scrollToElement: scrollToElement,
    openStoredResult: openStoredResult,
    currentResult: function () {
      return { result: lastResult, mode: lastMode };
    },
  };

  updateInputState();
})();
