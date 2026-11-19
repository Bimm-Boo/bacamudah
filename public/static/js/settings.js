// BacaMudah: pengaturan tampilan ramah disleksia, disimpan di localStorage.
// File ini dimuat di <head> agar pengaturan diterapkan sebelum halaman digambar.
(function () {
  "use strict";

  const STORAGE_KEY = "bacamudah-pengaturan";
  const DEFAULTS = {
    font: "lexend",
    size: 18, // px
    lineHeight: 1.8,
    spacing: "normal",
    theme: "krem",
    ruler: false,
    bionic: false, // Bionic Reading: huruf awal setiap kata ditebalkan
  };
  const SWITCHES = ["ruler", "bionic"]; // pengaturan berbentuk sakelar (checkbox)
  const CHOICES = {
    font: ["lexend", "opendyslexic", "sans"],
    spacing: ["normal", "renggang", "sangat"],
    theme: ["krem", "kuning", "biru", "gelap"],
  };
  const RANGES = { size: [16, 28], lineHeight: [1.5, 2.5] };

  const root = document.documentElement;
  let settings = loadSettings();
  let ruler = null;
  let panel = null;

  // ----- Simpan dan muat -----
  // Nilai yang tidak dikenal (data lama atau rusak) diganti dengan default.
  function sanitize(raw) {
    const clean = Object.assign({}, DEFAULTS);
    Object.keys(CHOICES).forEach(function (key) {
      if (CHOICES[key].includes(raw[key])) clean[key] = raw[key];
    });
    Object.keys(RANGES).forEach(function (key) {
      if (typeof raw[key] === "number" && Number.isFinite(raw[key])) {
        clean[key] = Math.min(RANGES[key][1], Math.max(RANGES[key][0], raw[key]));
      }
    });
    SWITCHES.forEach(function (key) {
      clean[key] = raw[key] === true;
    });
    return clean;
  }

  function loadSettings() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
    } catch (error) {
      return Object.assign({}, DEFAULTS); // localStorage diblokir atau isinya rusak
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      // Sebagian mode privat menolak penyimpanan. Pengaturan tetap berlaku
      // sampai halaman ditutup, jadi tidak perlu menampilkan error.
    }
  }

  // ----- Terapkan ke halaman (CSS membaca atribut dan variabel ini) -----
  function applySettings() {
    root.dataset.font = settings.font;
    root.dataset.spacing = settings.spacing;
    root.dataset.theme = settings.theme;
    root.dataset.ruler = settings.ruler ? "on" : "off";
    root.dataset.bionic = settings.bionic ? "on" : "off";
    root.style.setProperty("--read-size", settings.size / 16 + "rem");
    root.style.setProperty("--read-line", String(settings.lineHeight));
  }

  // ----- Bionic Reading -----
  // Setiap kata dibungkus <span class="bionic-word"> dan huruf awalnya <span class="bionic-head">.
  // Kata yang sudah dibungkus dilewati, jadi aman dipanggil berulang. Tebalnya diatur CSS
  // lewat atribut data-bionic, jadi menyalakan/mematikan tidak perlu menggambar ulang teks.
  // Isi teks tidak berubah, sehingga baca nyaring, salin, dan blok kata tetap normal.
  const WORD_PATTERN = /\p{L}[\p{L}\p{M}]*/gu;

  function bionicHeadLength(word) {
    if (word.length <= 3) return 1;
    if (word.length <= 6) return 2;
    return 3;
  }

  function markTextNode(node) {
    const text = node.textContent;
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(WORD_PATTERN)) {
      const word = match[0];
      const headLength = bionicHeadLength(word);
      const wrapper = document.createElement("span");
      wrapper.className = "bionic-word";
      const head = document.createElement("span");
      head.className = "bionic-head";
      head.textContent = word.slice(0, headLength);
      wrapper.append(head, word.slice(headLength));
      fragment.append(text.slice(last, match.index), wrapper);
      last = match.index + word.length;
    }
    fragment.append(text.slice(last));
    node.replaceWith(fragment);
  }

  function addBionicMarks(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent || parent.closest(".bionic-word, script, style")) return NodeFilter.FILTER_REJECT;
        return /\p{L}/u.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(markTextNode);
  }

  // ----- Penggaris baca -----
  function moveRuler(event) {
    const top = Math.round(event.clientY - ruler.offsetHeight / 2);
    ruler.style.transform = "translateY(" + top + "px)";
  }

  // Kursor hanya dipantau saat penggaris baca aktif.
  function updateRulerListeners() {
    const method = settings.ruler ? "addEventListener" : "removeEventListener";
    window[method]("pointermove", moveRuler);
    window[method]("pointerdown", moveRuler);
  }

  // ----- Panel pengaturan -----
  function formatValue(key) {
    if (key === "size") return settings.size + " px";
    return String(settings.lineHeight).replace(".", ",");
  }

  // Samakan isi panel dengan pengaturan yang sedang berlaku.
  function syncControls() {
    Object.keys(CHOICES).forEach(function (key) {
      panel.querySelector('input[name="' + key + '"][value="' + settings[key] + '"]').checked = true;
    });
    Object.keys(RANGES).forEach(function (key) {
      const input = panel.querySelector('input[name="' + key + '"]');
      const valueLabel = formatValue(key);
      input.value = settings[key];
      input.setAttribute("aria-valuetext", valueLabel);
      panel.querySelector('[data-value-for="' + key + '"]').textContent = valueLabel;
    });
    SWITCHES.forEach(function (key) {
      panel.querySelector('input[name="' + key + '"]').checked = settings[key];
    });
  }

  function commitSettings() {
    applySettings();
    saveSettings();
    updateRulerListeners();
    syncControls();
  }

  function setupPanel() {
    const toggleButton = document.getElementById("settings-toggle");
    const closeButton = document.getElementById("settings-close");
    const resetButton = document.getElementById("settings-reset");
    const status = document.getElementById("settings-status");

    // Saat dibuka, fokus pindah ke panel agar pembaca layar langsung mengumumkannya.
    // Saat ditutup lewat tombol Selesai atau Esc, fokus kembali ke tombol di header.
    function openPanel() {
      panel.hidden = false;
      toggleButton.setAttribute("aria-expanded", "true");
      panel.focus();
    }

    function closePanel(returnFocus) {
      panel.hidden = true;
      toggleButton.setAttribute("aria-expanded", "false");
      if (returnFocus) toggleButton.focus();
    }

    toggleButton.addEventListener("click", function () {
      if (panel.hidden) openPanel();
      else closePanel(false);
    });
    closeButton.addEventListener("click", function () { closePanel(true); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) closePanel(true);
    });

    // Satu pendengar untuk semua kontrol: nama input = nama pengaturan.
    panel.addEventListener("input", function (event) {
      const input = event.target;
      if (!(input.name in DEFAULTS)) return;

      if (input.type === "checkbox") settings[input.name] = input.checked;
      else if (input.type === "range") settings[input.name] = Number(input.value);
      else settings[input.name] = input.value;

      status.textContent = "";
      commitSettings();
    });

    resetButton.addEventListener("click", function () {
      settings = Object.assign({}, DEFAULTS);
      commitSettings();
      status.textContent = "Pengaturan sudah dikembalikan ke awal.";
    });

    syncControls();
  }

  function init() {
    ruler = document.querySelector(".reading-ruler");
    updateRulerListeners();

    panel = document.getElementById("settings-panel");
    if (panel) setupPanel();

    // Teks bacaan yang sudah ada sejak awal (contoh di panel, halaman Tentang).
    document.querySelectorAll(".reading-text").forEach(addBionicMarks);
  }

  // Dipakai file lain: app.js dan quiz.js (teks yang dibuat belakangan), pdf-export.js.
  window.BacaMudahSettings = {
    addBionicMarks: addBionicMarks,
    bionicHeadLength: bionicHeadLength,
    current: function () {
      return Object.assign({}, settings);
    },
  };

  applySettings();
  document.addEventListener("DOMContentLoaded", init);
})();
