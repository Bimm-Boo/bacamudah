// BacaMudah: ekspor hasil ke PDF "ramah baca". Huruf, ukuran, jarak baris, jarak huruf,
// warna latar, dan Bionic Reading mengikuti pengaturan tampilan pengguna.
// Teks di PDF tetap berupa teks (bisa diblok dan dibacakan), bukan gambar.
(function () {
  "use strict";

  // jsPDF dan huruf baru dimuat saat tombol ditekan, agar halaman tetap ringan.
  const JSPDF_URL = "/static/js/vendor/jspdf.umd.min.js";
  const FONTS = {
    lexend: { family: "Lexend", normal: "Lexend-Regular.ttf", bold: "Lexend-Bold.ttf" },
    opendyslexic: { family: "BacaMudahDisleksia", normal: "BacaMudahDisleksia-Regular.ttf", bold: "BacaMudahDisleksia-Bold.ttf" },
  };
  const FONT_DIR = "/static/fonts/pdf/";
  const BUILT_IN_FAMILY = "helvetica"; // untuk pilihan huruf "Biasa"
  // Sama dengan CSS: [jarak huruf, tambahan jarak kata] dalam satuan em.
  const SPACING = { normal: [0, 0], renggang: [0.06, 0.14], sangat: [0.12, 0.28] };
  const PX_TO_PT = 0.75; // 1 px layar = 0,75 pt cetak
  const MARGIN = 48; // pt, sekitar 17 mm
  const FOOTER_SPACE = 28; // ruang untuk nomor halaman di bawah

  const button = document.getElementById("pdf-btn");
  const resultOutput = document.getElementById("result-output");
  const status = document.getElementById("result-status");

  let jsPdfPromise = null;
  const fontCache = new Map(); // nama file -> Promise<base64>

  // ----- Memuat jsPDF dan huruf -----
  function loadJsPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    if (!jsPdfPromise) {
      jsPdfPromise = new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.src = JSPDF_URL;
        script.onload = function () { resolve(window.jspdf); };
        script.onerror = function () {
          jsPdfPromise = null;
          reject(new Error("Pembuat PDF gagal dimuat. Periksa koneksi internet, lalu coba lagi."));
        };
        document.head.append(script);
      });
    }
    return jsPdfPromise;
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function loadFont(fileName) {
    if (!fontCache.has(fileName)) {
      const request = fetch(FONT_DIR + fileName)
        .then(function (response) {
          if (!response.ok) throw new Error("Huruf untuk PDF gagal dimuat. Coba lagi sebentar lagi.");
          return response.arrayBuffer();
        })
        .then(toBase64);
      request.catch(function () { fontCache.delete(fileName); });
      fontCache.set(fileName, request);
    }
    return fontCache.get(fileName);
  }

  // Daftarkan huruf pilihan pengguna ke dokumen. Kembalikan nama keluarganya untuk setFont().
  async function registerFont(doc, fontChoice) {
    const font = FONTS[fontChoice];
    if (!font) return BUILT_IN_FAMILY;
    const [normal, bold] = await Promise.all([loadFont(font.normal), loadFont(font.bold)]);
    doc.addFileToVFS(font.normal, normal);
    doc.addFont(font.normal, font.family, "normal");
    doc.addFileToVFS(font.bold, bold);
    doc.addFont(font.bold, font.family, "bold");
    return font.family;
  }

  // ----- Membaca isi Hasil dari halaman -----
  // Setiap paragraf/poin menjadi { type, newBlock, runs: [{ text, bold, term }] }.
  function collectRuns(element) {
    const runs = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      const term = Boolean(parent.closest(".key-term"));
      runs.push({ text: walker.currentNode.textContent, bold: term || Boolean(parent.closest("strong")), term: term });
    }
    return runs;
  }

  function collectBlocks() {
    const blocks = [];
    resultOutput.querySelectorAll(".result-block").forEach(function (block, blockIndex) {
      block.querySelectorAll(":scope > p, :scope > ul > li").forEach(function (element, index) {
        blocks.push({
          type: element.tagName === "LI" ? "li" : "p",
          newBlock: blockIndex > 0 && index === 0,
          runs: collectRuns(element),
        });
      });
    });
    return blocks;
  }

  // Bionic Reading: huruf awal setiap kata dibuat tebal (aturan sama dengan di layar).
  function splitBionic(text, run) {
    const segments = [];
    let last = 0;
    for (const match of text.matchAll(/\p{L}[\p{L}\p{M}]*/gu)) {
      const word = match[0];
      const head = window.BacaMudahSettings.bionicHeadLength(word);
      segments.push({ text: text.slice(last, match.index), bold: false, term: run.term });
      segments.push({ text: word.slice(0, head), bold: true, term: run.term });
      segments.push({ text: word.slice(head), bold: false, term: run.term });
      last = match.index + word.length;
    }
    segments.push({ text: text.slice(last), bold: false, term: run.term });
    return segments.filter(function (segment) { return segment.text; });
  }

  // Pecah teks menjadi kata. Satu kata bisa terdiri dari beberapa potongan (misalnya istilah tebal + titik).
  function toWords(runs, bionic) {
    const words = [];
    let current = [];
    runs.forEach(function (run) {
      run.text.split(/(\s+)/).forEach(function (piece) {
        if (!piece) return;
        if (/^\s+$/.test(piece)) {
          if (current.length) words.push(current);
          current = [];
          return;
        }
        if (bionic && !run.bold) current.push.apply(current, splitBionic(piece, run));
        else current.push({ text: piece, bold: run.bold, term: run.term });
      });
    });
    if (current.length) words.push(current);
    return words;
  }

  // ----- Menyusun halaman -----
  function readStyle(settings, family) {
    const css = getComputedStyle(document.documentElement);
    const color = function (name) { return css.getPropertyValue(name).trim(); };
    const fontSize = settings.size * PX_TO_PT;
    const spacing = SPACING[settings.spacing] || SPACING.normal;
    return {
      family: family,
      fontSize: fontSize,
      lineHeight: fontSize * settings.lineHeight,
      charSpace: spacing[0] * fontSize,
      extraWordSpace: spacing[1] * fontSize,
      bionic: settings.bionic,
      background: color("--bg"),
      text: color("--text"),
      accent: color("--primary-strong"),
      muted: color("--muted"),
      line: color("--border-strong"),
    };
  }

  function segmentWidth(doc, segment, style) {
    doc.setFont(style.family, segment.bold ? "bold" : "normal");
    return doc.getTextWidth(segment.text) + style.charSpace * segment.text.length;
  }

  function wrapWords(doc, words, maxWidth, style) {
    doc.setFont(style.family, "normal");
    const space = doc.getTextWidth(" ") + style.charSpace + style.extraWordSpace;
    const lines = [];
    let line = [];
    let width = 0;
    words.forEach(function (segments) {
      const wordWidth = segments.reduce(function (sum, segment) { return sum + segmentWidth(doc, segment, style); }, 0);
      if (line.length && width + space + wordWidth > maxWidth) {
        lines.push(line);
        line = [];
        width = 0;
      }
      width += (line.length ? space : 0) + wordWidth;
      line.push(segments);
    });
    if (line.length) lines.push(line);
    return { lines: lines, space: space };
  }

  function paintBackground(doc, style) {
    doc.setFillColor(style.background);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
  }

  function drawSegment(doc, segment, x, baseline, style) {
    doc.setFont(style.family, segment.bold ? "bold" : "normal");
    doc.setTextColor(segment.term ? style.accent : style.text);
    doc.text(segment.text, x, baseline, { charSpace: style.charSpace });
    return segmentWidth(doc, segment, style);
  }

  // Isi dokumen yang hurufnya sudah didaftarkan (lihat registerFont).
  function layoutDocument(doc, style, modeLabel) {
    const family = style.family;
    // Jarak huruf bawaan 0: tanpa ini, jarak huruf isi teks terbawa ke judul dan kaki halaman.
    doc.setCharSpace(0);
    doc.setFontSize(style.fontSize);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottom = pageHeight - MARGIN - FOOTER_SPACE;
    const contentWidth = pageWidth - MARGIN * 2;
    const bulletIndent = style.fontSize * 1.3;
    let y = MARGIN;
    paintBackground(doc, style);

    function ensureSpace(height) {
      if (y + height <= bottom) return;
      doc.addPage();
      paintBackground(doc, style);
      y = MARGIN;
    }

    // Judul dan keterangan
    const titleSize = style.fontSize * 1.4;
    const noteSize = style.fontSize * 0.8;
    y += titleSize;
    doc.setFont(family, "bold");
    doc.setFontSize(titleSize);
    doc.setTextColor(style.accent);
    doc.text("Hasil BacaMudah", MARGIN, y);
    y += noteSize * 2;
    doc.setFont(family, "normal");
    doc.setFontSize(noteSize);
    doc.setTextColor(style.muted);
    const date = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    doc.text("Mode: " + modeLabel + " · " + date, MARGIN, y);
    y += noteSize;
    doc.setDrawColor(style.line);
    doc.setLineWidth(1.5);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += style.lineHeight * 0.6;
    doc.setFontSize(style.fontSize);

    // Isi: paragraf dan poin, dengan pindah halaman otomatis
    collectBlocks().forEach(function (block) {
      if (block.newBlock) y += style.lineHeight * 0.4;
      const indent = block.type === "li" ? bulletIndent : 0;
      const wrapped = wrapWords(doc, toWords(block.runs, style.bionic), contentWidth - indent, style);
      wrapped.lines.forEach(function (line, lineIndex) {
        ensureSpace(style.lineHeight);
        const baseline = y + style.lineHeight / 2 + style.fontSize * 0.32;
        if (block.type === "li" && lineIndex === 0) {
          drawSegment(doc, { text: "•", bold: true, term: true }, MARGIN, baseline, style);
        }
        let x = MARGIN + indent;
        line.forEach(function (segments, wordIndex) {
          if (wordIndex) x += wrapped.space;
          segments.forEach(function (segment) { x += drawSegment(doc, segment, x, baseline, style); });
        });
        y += style.lineHeight;
      });
      y += style.lineHeight * 0.3;
    });

    // Kaki halaman: alamat website dan nomor halaman
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont(family, "normal");
      doc.setFontSize(9);
      doc.setTextColor(style.muted);
      doc.text("BacaMudah · " + window.location.host, MARGIN, pageHeight - MARGIN / 2);
      doc.text("Halaman " + page + " dari " + pageCount, pageWidth - MARGIN, pageHeight - MARGIN / 2, { align: "right" });
    }

    doc.setProperties({ title: "Hasil BacaMudah - " + modeLabel, creator: "BacaMudah" });
    doc.setLanguage("id-ID");
  }

  // ----- Tombol Unduh PDF -----
  function modeLabelOf(mode) {
    const input = document.querySelector('input[name="mode"][value="' + mode + '"]');
    return input ? input.closest("label").querySelector(".mode-label").textContent : mode;
  }

  async function exportPdf() {
    const current = window.BacaMudah.currentResult();
    if (!current.result) return;
    button.disabled = true;
    status.textContent = "Sedang membuat PDF…";
    try {
      const settings = window.BacaMudahSettings.current();
      const jspdf = await loadJsPdf();
      const doc = new jspdf.jsPDF({ unit: "pt", format: "a4" });
      const family = await registerFont(doc, settings.font); // huruf berlaku per dokumen
      layoutDocument(doc, readStyle(settings, family), modeLabelOf(current.mode));
      doc.save("bacamudah-" + current.mode + ".pdf");
      status.textContent = "File PDF sedang diunduh.";
    } catch (error) {
      status.textContent = error.message || "PDF belum berhasil dibuat. Coba lagi.";
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener("click", exportPdf);
})();
