// BacaMudah: riwayat materi. Lima materi terakhir beserta hasil dan skor kuisnya
// disimpan otomatis di browser ini saja (localStorage), tanpa akun.
(function () {
  "use strict";

  const STORAGE_KEY = "bacamudah-riwayat";
  const MAX_ITEMS = 5;
  const TITLE_CHARS = 70;
  const MODE_LABELS = {
    sederhana: "Teks Sederhana",
    poin: "Poin-Poin",
    analogi: "Analogi",
    istilah: "Istilah Sulit",
  };
  const LEVEL_LABELS = { sd: "SD", smp: "SMP", sma: "SMA", mahasiswa: "Mahasiswa" };

  const list = document.getElementById("history-list");
  const emptyText = document.getElementById("history-empty");
  const note = document.getElementById("history-note");
  const clearButton = document.getElementById("history-clear");
  const status = document.getElementById("history-status");

  let entries = loadEntries();
  let currentId = null; // riwayat yang hasilnya sedang tampil

  // ----- Simpan dan muat -----
  function isValidEntry(item) {
    return item && typeof item.id === "string" && typeof item.source === "string" &&
      typeof item.result === "string" && item.mode in MODE_LABELS &&
      (item.level === undefined || item.level in LEVEL_LABELS); // riwayat lama belum punya jenjang
  }

  function loadEntries() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) ? saved.filter(isValidEntry).slice(0, MAX_ITEMS) : [];
    } catch (error) {
      return []; // localStorage diblokir atau isinya rusak
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      note.hidden = true;
    } catch (error) {
      // Mode privat atau penyimpanan penuh: riwayat tetap ada sampai halaman ditutup.
      note.hidden = false;
    }
  }

  // ----- Tampilan daftar -----
  function titleOf(entry) {
    const text = entry.source.replace(/\s+/g, " ").trim();
    return text.length > TITLE_CHARS ? text.slice(0, TITLE_CHARS).trim() + "…" : text;
  }

  function metaOf(entry) {
    const parts = [MODE_LABELS[entry.mode]];
    if (entry.level) parts.push(LEVEL_LABELS[entry.level]);
    const date = new Date(entry.savedAt);
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
    }
    if (entry.quiz) parts.push("Skor kuis " + entry.quiz.score + "/" + entry.quiz.total);
    return parts.join(" · ");
  }

  function createButton(text, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary btn-small";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", onClick);
    return button;
  }

  function renderList() {
    list.replaceChildren();
    entries.forEach(function (entry) {
      const title = titleOf(entry);
      const item = document.createElement("li");
      item.className = "history-item" + (entry.id === currentId ? " is-current" : "");

      const info = document.createElement("div");
      info.className = "history-info";
      const heading = document.createElement("p");
      heading.className = "history-title";
      heading.textContent = title;
      const meta = document.createElement("p");
      meta.className = "history-meta";
      meta.textContent = metaOf(entry);
      info.append(heading, meta);
      if (entry.id === currentId) {
        const badge = document.createElement("span");
        badge.className = "history-badge";
        badge.textContent = "Sedang dibuka";
        info.prepend(badge);
      }

      const actions = document.createElement("div");
      actions.className = "history-actions";
      actions.append(
        createButton("Buka", "Buka riwayat: " + title, function () { openEntry(entry.id); }),
        createButton("Hapus", "Hapus riwayat: " + title, function () { removeEntry(entry.id); })
      );
      item.append(info, actions);
      list.append(item);
    });
    emptyText.hidden = entries.length > 0;
    clearButton.hidden = entries.length === 0;
  }

  // ----- Aksi -----
  function openEntry(id) {
    const entry = entries.find(function (item) { return item.id === id; });
    if (entry) window.BacaMudah.openStoredResult(entry);
  }

  function removeEntry(id) {
    entries = entries.filter(function (item) { return item.id !== id; });
    if (id === currentId) currentId = null;
    saveEntries();
    renderList();
    status.textContent = "Satu riwayat sudah dihapus.";
    // Fokus pindah ke tombol riwayat berikutnya, atau ke judul jika daftar sudah kosong.
    (list.querySelector("button") || document.getElementById("judul-riwayat")).focus();
  }

  function clearAll() {
    if (!window.confirm("Hapus semua riwayat materi di browser ini?")) return;
    entries = [];
    currentId = null;
    saveEntries();
    renderList();
    status.textContent = "Semua riwayat sudah dihapus.";
    document.getElementById("judul-riwayat").focus();
  }

  // Hasil baru disimpan otomatis. Materi, mode, dan jenjang yang sama menggantikan simpanan lamanya.
  function handleResult(event) {
    const detail = event.detail;
    if (detail.demo) {
      currentId = null; // hasil demo tidak disimpan di riwayat
      renderList();
      return;
    }
    if (detail.restoredId) {
      currentId = detail.restoredId;
      renderList();
      return;
    }
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      savedAt: new Date().toISOString(),
      mode: detail.mode,
      level: detail.level,
      source: detail.sourceText,
      result: detail.result,
      quiz: null,
    };
    entries = [entry].concat(entries.filter(function (item) {
      return !(item.source === entry.source && item.mode === entry.mode && item.level === entry.level);
    })).slice(0, MAX_ITEMS);
    currentId = entry.id;
    saveEntries();
    renderList();
  }

  // Skor kuis terakhir disimpan bersama materi yang sedang dibuka.
  function handleQuizDone(event) {
    const entry = entries.find(function (item) { return item.id === currentId; });
    if (!entry) return;
    entry.quiz = { score: event.detail.score, total: event.detail.total };
    saveEntries();
    renderList();
  }

  clearButton.addEventListener("click", clearAll);
  document.addEventListener("bacamudah:result", handleResult);
  document.addEventListener("bacamudah:quizdone", handleQuizDone);
  renderList();
})();
