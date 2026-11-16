// BacaMudah: input materi, unggah PDF, proses AI, serta salin dan unduh hasil.
(function () {
  "use strict";

  const REQUEST_TIMEOUT_MS = 90000; // 90 detik, termasuk saat server baru "bangun"
  const LABELED_MODES = ["analogi", "istilah"]; // mode yang barisnya berformat "Label: isi"

  const textInput = document.getElementById("input-text");
  const charCount = document.getElementById("char-count");
  const limitWarning = document.getElementById("limit-warning");
  const inputMessage = document.getElementById("input-message");
  const sampleButton = document.getElementById("sample-btn");
  const pdfInput = document.getElementById("pdf-file");
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const processButton = document.getElementById("process-btn");
  const resultHeading = document.getElementById("judul-hasil");
  const resultStatus = document.getElementById("result-status");
  const resultError = document.getElementById("result-error");
  const resultErrorText = document.getElementById("result-error-text");
  const retryButton = document.getElementById("retry-btn");
  const resultOutput = document.getElementById("result-output");
  const copyButton = document.getElementById("copy-btn");
  const downloadButton = document.getElementById("download-btn");

  const maxChars = Number(textInput.dataset.maxChars);
  const maxPdfMb = Number(pdfInput.dataset.maxMb); // batasnya ditentukan di app.py
  let isProcessing = false;
  let lastResult = ""; // teks hasil terakhir, dipakai tombol Salin dan Unduh
  let lastMode = "";

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

    processButton.disabled = isProcessing || isOverLimit || textInput.value.trim() === "";
  }

  // ----- Tab Teks / PDF (bisa dengan klik atau tombol panah) -----
  function selectTab(selectedTab) {
    tabs.forEach(function (tab) {
      const isSelected = tab === selectedTab;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !isSelected;
    });
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

  // Tiap kalimat dibungkus <span class="sentence"> agar bisa disorot saat dibacakan.
  function createLine(tagName, line, useLabel) {
    const element = document.createElement(tagName);
    splitSentences(line).forEach(function (sentence, index) {
      const span = document.createElement("span");
      span.className = "sentence";
      const match = useLabel && index === 0 ? sentence.match(/^([^:]{1,60}):\s+(.+)$/) : null;
      if (match) {
        const label = document.createElement("strong");
        label.textContent = match[1] + ":";
        span.append(label, " " + match[2]);
      } else {
        span.textContent = sentence;
      }
      if (index > 0) element.append(" ");
      element.append(span);
    });
    return element;
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
          list.append(createLine("li", line.slice(2), useLabel));
        } else {
          list = null;
          block.append(createLine("p", line, useLabel));
        }
      });
      resultOutput.append(block);
    });
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
    if (!text || isProcessing) return;

    setProcessing(true);
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
      renderResult(data.result, mode);
      lastResult = data.result;
      lastMode = mode;
      copyButton.disabled = false;
      downloadButton.disabled = false;
      // Kabari tts.js (menyiapkan kalimat baru) dan quiz.js (menyimpan materi untuk kuis).
      document.dispatchEvent(new CustomEvent("bacamudah:result", { detail: { sourceText: text } }));
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
      await navigator.clipboard.writeText(lastResult);
      resultStatus.textContent = "Hasil sudah disalin.";
    } catch (error) {
      resultStatus.textContent = "Tidak bisa menyalin otomatis. Blok teks hasilnya, lalu salin secara manual.";
    }
  }

  function downloadResult() {
    // Baris baru gaya Windows (CRLF) agar rapi juga saat dibuka di Notepad.
    const content = lastResult.replace(/\n/g, "\r\n") + "\r\n";
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

  // Fungsi yang juga dipakai file lain (quiz.js).
  window.BacaMudah = {
    requestJson: requestJson,
    showLoading: showLoading,
    scrollToElement: scrollToElement,
  };

  updateInputState();
})();
