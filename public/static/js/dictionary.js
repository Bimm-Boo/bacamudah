// BacaMudah: kamus kontekstual. Ketuk istilah penting atau blok kata di bagian Hasil
// untuk melihat artinya dalam bahasa sehari-hari, tanpa pindah halaman.
(function () {
  "use strict";

  // Batas yang sama dengan app.py, agar pengguna langsung tahu sebelum dikirim.
  const MAX_TERM_CHARS = 60;
  const MAX_TERM_WORDS = 5;
  const MAX_CONTEXT_CHARS = 600;
  const EDGE_GAP = 12; // jarak minimal popover dari tepi layar (px)
  const SELECTION_DELAY_MS = 250; // tunggu sampai pengguna selesai memblok

  const resultOutput = document.getElementById("result-output");
  const hint = document.getElementById("dict-hint");
  const popover = document.getElementById("dict-popover");
  const termTitle = document.getElementById("dict-term");
  const body = document.getElementById("dict-body");
  const closeButton = document.getElementById("dict-close");
  const selectButton = document.getElementById("dict-select-btn");

  const cache = new Map(); // arti yang sudah pernah dicari: "istilah|kalimat" -> arti
  let trigger = null; // elemen yang membuka popover, untuk mengembalikan fokus
  let pendingSelection = null; // kata yang sedang diblok: { term, context, rect }
  let pressingSelectButton = false;
  let selectionTimer = null;
  let requestId = 0; // untuk mengabaikan jawaban lama jika pengguna sudah membuka kata lain

  // Rapikan spasi dan buang tanda baca di awal/akhir ("(evaporasi)," -> "evaporasi").
  function cleanTerm(text) {
    return text.replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  }

  function isValidTerm(term) {
    return term.length >= 2 && term.length <= MAX_TERM_CHARS && term.split(" ").length <= MAX_TERM_WORDS;
  }

  // Kalimat tempat kata itu muncul, dikirim ke AI agar artinya sesuai konteks.
  function contextOf(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const holder = element && (element.closest(".sentence") || element.closest("p, li"));
    return holder ? holder.textContent.replace(/\s+/g, " ").trim().slice(0, MAX_CONTEXT_CHARS) : "";
  }

  // Letakkan elemen di bawah area yang ditunjuk (atau di atasnya jika tidak muat), tetap di dalam layar.
  function placeNear(element, rect) {
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const maxLeft = document.documentElement.clientWidth - width - EDGE_GAP;
    const left = Math.max(EDGE_GAP, Math.min(rect.left, maxLeft));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - EDGE_GAP && rect.top - height - 8 > EDGE_GAP) {
      top = rect.top - height - 8;
    }
    element.style.left = left + window.scrollX + "px";
    element.style.top = top + window.scrollY + "px";
  }

  function showLoadingText() {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    body.replaceChildren(spinner, "Sedang mencari arti…");
  }

  // ----- Membuka dan menutup popover -----
  async function openDefinition(term, context, rect, fromElement) {
    hideSelectButton();
    trigger = fromElement;
    termTitle.textContent = term;
    popover.hidden = false;
    requestId += 1;
    const myRequest = requestId;

    const key = term.toLowerCase() + "|" + context;
    if (cache.has(key)) {
      body.textContent = cache.get(key);
    } else {
      showLoadingText();
    }
    window.BacaMudahSettings.addBionicMarks(body);
    placeNear(popover, rect);
    // Fokus ke popover agar pembaca layar mengumumkannya; Esc atau Tutup mengembalikan fokus.
    popover.focus({ preventScroll: true });
    if (cache.has(key)) return;

    try {
      const data = await window.BacaMudah.requestJson("/api/define", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: term, context: context }),
      });
      cache.set(key, data.definition); // disimpan meski popover sudah ditutup, agar lain kali langsung muncul
      if (myRequest !== requestId) return;
      body.textContent = data.definition;
    } catch (error) {
      if (myRequest !== requestId) return;
      body.textContent = error.message;
    }
    window.BacaMudahSettings.addBionicMarks(body);
    placeNear(popover, rect); // tinggi popover berubah setelah isinya muncul
  }

  function closePopover(returnFocus) {
    if (popover.hidden) return;
    requestId += 1;
    popover.hidden = true;
    if (returnFocus && trigger && document.body.contains(trigger)) trigger.focus();
    trigger = null;
  }

  // ----- Kata yang diblok -----
  function hideSelectButton() {
    selectButton.hidden = true;
    pendingSelection = null;
  }

  function checkSelection() {
    if (pressingSelectButton) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      hideSelectButton();
      return;
    }
    const range = selection.getRangeAt(0);
    const term = cleanTerm(selection.toString());
    if (!resultOutput.contains(range.commonAncestorContainer) || !isValidTerm(term)) {
      hideSelectButton();
      return;
    }
    const lineRects = range.getClientRects();
    const rect = lineRects.length ? lineRects[lineRects.length - 1] : range.getBoundingClientRect();
    pendingSelection = { term: term, context: contextOf(range.startContainer), rect: rect };
    selectButton.hidden = false;
    placeNear(selectButton, rect);
  }

  function handleSelectionChange() {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(checkSelection, SELECTION_DELAY_MS);
  }

  // ----- Pasang semua event -----
  resultOutput.addEventListener("click", function (event) {
    const term = event.target.closest(".key-term");
    if (!term) return;
    openDefinition(cleanTerm(term.textContent), contextOf(term), term.getBoundingClientRect(), term);
  });

  // Tahan blok kata saat tombol ditekan (tanpa ini, menekan tombol menghapus blok).
  selectButton.addEventListener("pointerdown", function (event) {
    pressingSelectButton = true;
    event.preventDefault();
  });
  document.addEventListener("pointerup", function () {
    setTimeout(function () { pressingSelectButton = false; }, 0);
  });
  selectButton.addEventListener("click", function () {
    pressingSelectButton = false;
    if (!pendingSelection) return;
    const chosen = pendingSelection;
    openDefinition(chosen.term, chosen.context, chosen.rect, null);
  });

  closeButton.addEventListener("click", function () { closePopover(true); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closePopover(true);
  });
  // Ketuk di luar popover untuk menutupnya.
  document.addEventListener("pointerdown", function (event) {
    if (popover.hidden || popover.contains(event.target) || event.target.closest(".key-term, #dict-select-btn")) return;
    closePopover(false);
  });
  document.addEventListener("selectionchange", handleSelectionChange);

  // Hasil baru: tampilkan petunjuk, tutup popover lama. Proses baru: tutup juga.
  document.addEventListener("bacamudah:result", function () {
    hint.hidden = false;
    closePopover(false);
    hideSelectButton();
  });
  document.addEventListener("bacamudah:processing", function () {
    closePopover(false);
    hideSelectButton();
  });
})();
