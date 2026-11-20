"""BacaMudah: aplikasi Flask (halaman dan endpoint API)."""

import io
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, url_for
from werkzeug.exceptions import HTTPException

from ai import AIError, define_term, generate_quiz, process_text
from pdf_utils import PdfError, extract_text
from prompts import DEFAULT_LEVEL, LEVELS, MODES
from rate_limit import RateLimiter

load_dotenv()  # baca GEMINI_API_KEY dan GEMINI_MODEL dari file .env
logging.basicConfig(level=logging.INFO)

MAX_TEXT_CHARS = 15_000
MAX_TEXT_LABEL = f"{MAX_TEXT_CHARS:,}".replace(",", ".")  # "15.000" (format Indonesia)
# Vercel membatasi isi satu permintaan sebesar 4,5 MB, jadi batas PDF dibuat sedikit di bawahnya.
MAX_PDF_MB = 4
MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024
SAMPLE_DIR = Path(__file__).parent / "sample"
SAMPLE_TEXT = (SAMPLE_DIR / "contoh.txt").read_text(encoding="utf-8")
# Demo satu klik: hasil "Teks Sederhana" dan kuis untuk contoh materi, dibuat sekali
# dengan Gemini lalu disimpan, agar demo langsung tampil tanpa menunggu AI.
DEMO_DATA = {
    "result": (SAMPLE_DIR / "demo_hasil.txt").read_text(encoding="utf-8").strip(),
    "mode": "sederhana",
    "questions": json.loads((SAMPLE_DIR / "demo_kuis.json").read_text(encoding="utf-8"))["questions"],
}
# Kamus kontekstual: istilah pendek (maksimal 5 kata) dan satu kalimat konteks.
MAX_TERM_CHARS = 60
MAX_TERM_WORDS = 5
MAX_CONTEXT_CHARS = 600
# Rate limit: tiap IP boleh 20 permintaan API per menit, agar kuota AI aman.
RATE_LIMIT_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 60

# Pesan ramah untuk error HTTP umum di endpoint API.
HTTP_ERROR_MESSAGES = {
    400: "Permintaan tidak valid. Muat ulang halaman, lalu coba lagi.",
    404: "Alamat tidak ditemukan.",
    405: "Cara permintaan tidak didukung.",
    413: f"Ukuran file terlalu besar. Maksimal {MAX_PDF_MB} MB.",
}

# Judul dan pesan untuk halaman error (selain endpoint API).
PAGE_NOT_FOUND = (
    "Halaman tidak ditemukan",
    "Alamat yang kamu buka tidak ada. Mungkin ada salah ketik.",
)
PAGE_ERROR = (
    "Terjadi kesalahan",
    "Halaman ini belum bisa ditampilkan. Coba muat ulang, atau kembali ke halaman utama.",
)

# File statis ada di public/static: di Vercel folder public/ disajikan langsung
# oleh CDN, dan saat dijalankan di laptop Flask yang menyajikannya. Alamatnya
# tetap /static/... di kedua tempat.
app = Flask(__name__, static_folder="public/static")
# Batas ukuran upload, ditambah sedikit ruang untuk data form selain file.
app.config["MAX_CONTENT_LENGTH"] = MAX_PDF_BYTES + 64 * 1024

api_limiter = RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS)


def error_response(message, status_code):
    return jsonify({"error": message}), status_code


def error_page(status_code):
    """Halaman error yang ramah untuk pengunjung (bukan untuk endpoint API)."""
    title, message = PAGE_NOT_FOUND if status_code == 404 else PAGE_ERROR
    return render_template("error.html", title=title, message=message), status_code


def client_ip():
    """Alamat IP pengunjung, dipakai untuk rate limit."""
    # Di Vercel, permintaan lewat proxy milik Vercel. IP asli pengunjung ada di
    # header X-Real-IP, yang selalu diisi ulang oleh Vercel sehingga tidak bisa
    # dipalsukan. Di laptop tidak ada proxy, jadi pakai alamat koneksi langsung.
    if os.getenv("VERCEL"):
        return request.headers.get("X-Real-IP") or request.remote_addr
    return request.remote_addr


def read_json_payload():
    """Ambil isi JSON dari permintaan. Selalu berupa dict, kosong jika tidak valid."""
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def read_material(payload):
    """Periksa teks materi. Kembalikan (teks, None) jika valid, atau (None, respons error)."""
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        return None, error_response("Teks masih kosong. Tempel materi dulu, ya.", 400)
    text = text.strip()
    if len(text) > MAX_TEXT_CHARS:
        return None, error_response(
            f"Teks terlalu panjang. Maksimal {MAX_TEXT_LABEL} karakter.", 413
        )
    return text, None


@app.before_request
def limit_api_requests():
    """Tolak permintaan API jika satu IP mengirim terlalu banyak dalam satu menit."""
    if not request.path.startswith("/api/"):
        return None
    wait_seconds = api_limiter.check(client_ip())
    if wait_seconds:
        message = f"Kamu mengirim terlalu banyak permintaan. Tunggu {wait_seconds} detik, lalu coba lagi."
        return jsonify({"error": message}), 429, {"Retry-After": str(wait_seconds)}
    return None


@app.get("/")
def index():
    return render_template(
        "index.html",
        max_text_chars=MAX_TEXT_CHARS,
        max_text_label=MAX_TEXT_LABEL,
        max_pdf_mb=MAX_PDF_MB,
        sample_text=SAMPLE_TEXT,
        demo_data=DEMO_DATA,
    )


@app.get("/tentang")
def tentang():
    return render_template(
        "tentang.html",
        max_text_label=MAX_TEXT_LABEL,
        max_pdf_mb=MAX_PDF_MB,
        rate_limit_requests=RATE_LIMIT_REQUESTS,
    )


@app.get("/favicon.ico")
def favicon():
    # Browser selalu meminta /favicon.ico; arahkan ke logo SVG agar tidak muncul error 404.
    return redirect(url_for("static", filename="img/logo.svg"), 301)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/extract-pdf")
def api_extract_pdf():
    uploaded = request.files.get("file")
    if uploaded is None or not uploaded.filename:
        return error_response("Pilih file PDF terlebih dahulu.", 400)
    if not uploaded.filename.lower().endswith(".pdf"):
        return error_response("File harus berformat PDF.", 400)

    data = uploaded.read()
    if len(data) > MAX_PDF_BYTES:
        return error_response(f"Ukuran PDF maksimal {MAX_PDF_MB} MB.", 413)
    if b"%PDF" not in data[:1024]:
        return error_response("File ini bukan PDF yang valid.", 400)

    try:
        text, truncated = extract_text(io.BytesIO(data), MAX_TEXT_CHARS)
    except PdfError as error:
        return error_response(error.message, 422)
    return jsonify({"text": text, "truncated": truncated})


@app.post("/api/process")
def api_process():
    payload = read_json_payload()
    text, error_reply = read_material(payload)
    if error_reply:
        return error_reply
    mode = payload.get("mode")
    if mode not in MODES:
        return error_response("Mode tidak dikenal. Pilih salah satu mode yang tersedia.", 400)
    level = payload.get("level") or DEFAULT_LEVEL  # halaman versi lama belum mengirim jenjang
    if level not in LEVELS:
        return error_response("Jenjang pembaca tidak dikenal. Pilih SD, SMP, SMA, atau Mahasiswa.", 400)

    try:
        result = process_text(text, mode, level)
    except AIError as error:
        return error_response(error.message, error.status_code)
    return jsonify({"result": result})


@app.post("/api/quiz")
def api_quiz():
    text, error_reply = read_material(read_json_payload())
    if error_reply:
        return error_reply

    try:
        questions = generate_quiz(text)
    except AIError as error:
        return error_response(error.message, error.status_code)
    return jsonify({"questions": questions})


@app.post("/api/define")
def api_define():
    payload = read_json_payload()
    term = payload.get("term")
    context = payload.get("context") or ""
    if not isinstance(term, str) or not term.strip():
        return error_response("Pilih kata yang ingin dicari artinya.", 400)
    term = " ".join(term.split())
    if len(term) > MAX_TERM_CHARS or len(term.split()) > MAX_TERM_WORDS:
        return error_response(f"Pilih kata atau istilah pendek saja (maksimal {MAX_TERM_WORDS} kata).", 400)
    if not isinstance(context, str):
        context = ""
    context = " ".join(context.split())[:MAX_CONTEXT_CHARS]

    try:
        definition = define_term(term, context)
    except AIError as error:
        return error_response(error.message, error.status_code)
    return jsonify({"term": term, "definition": definition})


@app.errorhandler(HTTPException)
def handle_http_error(error):
    """Endpoint API membalas JSON; halaman biasa menampilkan halaman error yang ramah."""
    if request.path.startswith("/api/"):
        message = HTTP_ERROR_MESSAGES.get(error.code, "Permintaan tidak bisa diproses.")
        return error_response(message, error.code)
    return error_page(error.code)


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    """Error tak terduga: catat di log, tampilkan pesan ramah."""
    app.logger.exception("Error tak terduga")
    if request.path.startswith("/api/"):
        return error_response("Terjadi kesalahan di server. Coba lagi sebentar lagi.", 500)
    return error_page(500)


if __name__ == "__main__":
    # Port 5001 karena port 5000 di macOS dipakai AirPlay.
    app.run(debug=True, port=5001)
