// BacaMudah: baca nyaring dengan Web Speech API, sambil menyorot kalimat yang dibacakan.
(function () {
  "use strict";

  const LANG = "id-ID";
  // Tiap ucapan dibuat pendek. Suara online di Chrome desktop bisa terputus
  // jika satu ucapan berlangsung lebih dari sekitar 15 detik.
  const MAX_CHUNK_CHARS = 130;
  const RESTART_DELAY_MS = 80; // jeda singkat setelah cancel() sebelum mulai bicara lagi
  const PLAY_LABELS = { idle: "Dengarkan", playing: "Jeda", paused: "Lanjut" };
  const VOICE_KEY = "bacamudah-suara"; // suara pilihan, disimpan di browser ini saja

  const controls = document.getElementById("tts-controls");
  const note = document.getElementById("tts-note");
  const playButton = document.getElementById("tts-play");
  const playLabel = document.getElementById("tts-play-label");
  const stopButton = document.getElementById("tts-stop");
  const voiceField = document.getElementById("tts-voice-field");
  const voiceSelect = document.getElementById("tts-voice");
  const resultOutput = document.getElementById("result-output");

  function showNote(text) {
    note.textContent = text;
    note.hidden = false;
  }

  function hideNote() {
    note.hidden = true;
    note.textContent = "";
  }

  // Browser tanpa Web Speech API: kontrol tetap tersembunyi, cukup beri keterangan.
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    showNote("Browser ini belum mendukung baca nyaring. Coba pakai Chrome.");
    return;
  }

  const synth = window.speechSynthesis;
  let queue = []; // daftar { element: <span kalimat>, text: teks yang diucapkan }
  let position = 0; // indeks ucapan yang sedang atau akan dibacakan
  let state = "idle"; // "idle" | "playing" | "paused"
  let token = 0; // naik tiap kali bacaan dimulai/dihentikan, untuk mengabaikan event ucapan lama
  let currentUtterance = null; // disimpan agar tidak dibuang browser sebelum selesai
  let highlighted = null;

  // ----- Menyiapkan teks -----
  // Gabungkan potongan kecil menjadi bagian yang panjangnya tidak melebihi batas.
  function packPieces(pieces, maxChars) {
    const chunks = [];
    let current = "";
    pieces.forEach(function (piece) {
      if (current && (current + piece).length > maxChars) {
        chunks.push(current);
        current = "";
      }
      current += piece;
    });
    if (current) chunks.push(current);
    return chunks;
  }

  // Kalimat panjang dipotong di tanda koma; jika masih terlalu panjang, dipotong per kata.
  function splitLongText(text) {
    if (text.length <= MAX_CHUNK_CHARS) return [text];
    const clauses = packPieces(text.match(/[^,;]+[,;]*\s*/g) || [text], MAX_CHUNK_CHARS);
    return clauses
      .flatMap(function (clause) {
        return clause.length > MAX_CHUNK_CHARS
          ? packPieces(clause.match(/\S+\s*/g), MAX_CHUNK_CHARS)
          : [clause];
      })
      .map(function (chunk) { return chunk.trim(); });
  }

  function buildQueue() {
    queue = [];
    resultOutput.querySelectorAll(".sentence").forEach(function (element) {
      splitLongText(element.textContent.trim()).forEach(function (text) {
        queue.push({ element: element, text: text });
      });
    });
  }

  // ----- Suara -----
  // Semua suara bahasa Indonesia; suara bawaan perangkat (tidak butuh internet) didahulukan.
  // Android menulis kode bahasa sebagai "id_ID", jadi garis bawah disamakan dulu.
  function listIndonesianVoices() {
    return synth.getVoices()
      .filter(function (voice) { return voice.lang.replace("_", "-").toLowerCase().startsWith("id"); })
      .sort(function (a, b) { return Number(b.localService) - Number(a.localService); });
  }

  // Suara yang dipilih di daftar; jika belum ada pilihan, suara Indonesia pertama.
  function findIndonesianVoice() {
    const voices = listIndonesianVoices();
    return voices.find(function (voice) { return voice.voiceURI === voiceSelect.value; }) ||
      voices[0] || null;
  }

  // Nama suara Android seperti "id-id-x-ide-local" sulit dibaca, jadi cukup diberi nomor.
  function voiceLabel(voice, index) {
    const name = /^[a-z]{2}[-_][a-z]{2}-x-/i.test(voice.name) ? "Suara " + (index + 1) : voice.name;
    return voice.localService ? name : name + " (online)";
  }

  function loadSavedVoice() {
    try {
      return localStorage.getItem(VOICE_KEY) || "";
    } catch (error) {
      return ""; // localStorage diblokir
    }
  }

  function saveVoice() {
    try {
      localStorage.setItem(VOICE_KEY, voiceSelect.value);
    } catch (error) {
      // Mode privat: pilihan tetap berlaku sampai halaman ditutup.
    }
  }

  // Daftar suara baru tampil jika ada lebih dari satu suara bahasa Indonesia.
  // Dipanggil lagi saat browser selesai memuat daftar suara (event voiceschanged).
  function populateVoices() {
    const voices = listIndonesianVoices();
    // Pilihan tersimpan didahulukan: suara online kadang baru muncul setelah suara bawaan.
    const wanted = loadSavedVoice() || voiceSelect.value;
    voiceSelect.replaceChildren(...voices.map(function (voice, index) {
      return new Option(voiceLabel(voice, index), voice.voiceURI);
    }));
    if (voices.some(function (voice) { return voice.voiceURI === wanted; })) voiceSelect.value = wanted;
    voiceField.hidden = voices.length < 2;
  }

  function getRate() {
    return Number(document.querySelector('input[name="tts-rate"]:checked').value);
  }

  // ----- Tampilan -----
  function setState(nextState) {
    state = nextState;
    playButton.dataset.state = state;
    playLabel.textContent = PLAY_LABELS[state];
    stopButton.disabled = state === "idle";
  }

  function highlight(element) {
    if (highlighted === element) return;
    if (highlighted) highlighted.classList.remove("is-speaking");
    highlighted = element;
    if (!element) return;

    element.classList.add("is-speaking");
    // Gulir hanya jika kalimatnya berada di luar layar.
    const rect = element.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  // ----- Kendali bacaan -----
  function speakCurrent() {
    token += 1;
    const myToken = token;
    const item = queue[position];
    const voice = findIndonesianVoice();

    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = LANG;
    if (voice) utterance.voice = voice;
    utterance.rate = getRate();
    utterance.onend = function () {
      if (myToken !== token) return; // sudah dijeda, dihentikan, atau diulang
      position += 1;
      if (position < queue.length) speakCurrent();
      else stop();
    };
    utterance.onerror = function () {
      if (myToken !== token) return;
      stop();
      showNote("Baca nyaring gagal diputar. Periksa koneksi internet, atau coba pakai Chrome.");
    };

    currentUtterance = utterance;
    highlight(item.element);
    setState("playing");
    synth.speak(utterance);
  }

  // Jeda dibuat dengan menghentikan ucapan dan mengingat posisinya, lalu "Lanjut"
  // mengulang dari awal kalimat itu. Cara ini lebih andal daripada
  // speechSynthesis.pause(), yang tidak berfungsi di Chrome Android.
  function pause() {
    token += 1;
    synth.cancel();
    setState("paused");
  }

  function stop() {
    token += 1;
    synth.cancel();
    currentUtterance = null;
    position = 0;
    highlight(null);
    setState("idle");
  }

  function handlePlayClick() {
    if (state === "playing") {
      pause();
      return;
    }
    if (state === "idle") {
      position = 0;
      // Daftar suara kosong berarti belum dimuat (umum di Android), jadi tidak dianggap masalah.
      if (synth.getVoices().length > 0 && !findIndonesianVoice()) {
        showNote("Suara bahasa Indonesia tidak ditemukan di perangkat ini, jadi pelafalannya mungkin kurang pas. Coba pakai Chrome.");
      } else {
        hideNote();
      }
    }
    if (synth.speaking || synth.pending) synth.cancel(); // bersihkan sisa ucapan lama
    speakCurrent();
  }

  // Kecepatan atau suara baru langsung berlaku: kalimat yang sedang dibaca diulang dengan pengaturan itu.
  function restartCurrentSentence() {
    if (state !== "playing") return;
    token += 1;
    const myToken = token;
    synth.cancel();
    setTimeout(function () {
      if (myToken === token) speakCurrent();
    }, RESTART_DELAY_MS);
  }

  function handleNewResult() {
    stop();
    hideNote();
    buildQueue();
    playButton.disabled = queue.length === 0;
  }

  // ----- Pasang semua event -----
  playButton.addEventListener("click", handlePlayClick);
  stopButton.addEventListener("click", stop);
  controls.addEventListener("change", function (event) {
    if (event.target === voiceSelect) saveVoice();
    if (event.target === voiceSelect || event.target.name === "tts-rate") restartCurrentSentence();
  });
  synth.addEventListener("voiceschanged", populateVoices);
  document.addEventListener("bacamudah:processing", stop); // dikirim app.js saat proses dimulai
  document.addEventListener("bacamudah:result", handleNewResult); // dikirim app.js saat hasil baru tampil
  window.addEventListener("pagehide", function () { synth.cancel(); });

  synth.cancel(); // hentikan sisa bacaan dari kunjungan sebelumnya
  populateVoices(); // juga memicu pemuatan daftar suara (di Chrome dimuat belakangan)
  setState("idle");
  controls.hidden = false;
})();
