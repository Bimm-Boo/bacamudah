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
  };
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
    clean.ruler = raw.ruler === true;
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
    root.style.setProperty("--read-size", settings.size / 16 + "rem");
    root.style.setProperty("--read-line", String(settings.lineHeight));
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
    panel.querySelector('input[name="ruler"]').checked = settings.ruler;
  }

  function commitSettings() {
    applySettings();
    saveSettings();
    updateRulerListeners();
    syncControls();
  }

  function setupPanel() {
    const toggleButton = document.getElementById("settings-toggle");
    const resetButton = document.getElementById("settings-reset");
    const status = document.getElementById("settings-status");

    toggleButton.addEventListener("click", function () {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      toggleButton.setAttribute("aria-expanded", String(willOpen));
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
  }

  applySettings();
  document.addEventListener("DOMContentLoaded", init);
})();
