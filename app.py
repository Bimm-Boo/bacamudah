"""BacaMudah: aplikasi Flask (halaman dan endpoint API)."""

import io
import logging
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

from ai import AIError, process_text
from pdf_utils import PdfError, extract_text
from prompts import MODES

load_dotenv()  # baca GEMINI_API_KEY dan GEMINI_MODEL dari file .env
logging.basicConfig(level=logging.INFO)

MAX_TEXT_CHARS = 15_000
MAX_TEXT_LABEL = f"{MAX_TEXT_CHARS:,}".replace(",", ".")  # "15.000" (format Indonesia)
MAX_PDF_BYTES = 5 * 1024 * 1024  # 5 MB
SAMPLE_TEXT = (Path(__file__).parent / "sample" / "contoh.txt").read_text(encoding="utf-8")

# Pesan ramah untuk error HTTP umum di endpoint API.
HTTP_ERROR_MESSAGES = {
    400: "Permintaan tidak valid. Muat ulang halaman, lalu coba lagi.",
    404: "Alamat tidak ditemukan.",
    405: "Cara permintaan tidak didukung.",
    413: "Ukuran file terlalu besar. Maksimal 5 MB.",
}

app = Flask(__name__)
# Batas ukuran upload, ditambah sedikit ruang untuk data form selain file.
app.config["MAX_CONTENT_LENGTH"] = MAX_PDF_BYTES + 64 * 1024


def error_response(message, status_code):
    return jsonify({"error": message}), status_code


@app.get("/")
def index():
    return render_template(
        "index.html",
        max_text_chars=MAX_TEXT_CHARS,
        max_text_label=MAX_TEXT_LABEL,
        sample_text=SAMPLE_TEXT,
    )


@app.get("/tentang")
def tentang():
    return render_template("tentang.html")


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
        return error_response("Ukuran PDF maksimal 5 MB.", 413)
    if b"%PDF" not in data[:1024]:
        return error_response("File ini bukan PDF yang valid.", 400)

    try:
        text, truncated = extract_text(io.BytesIO(data), MAX_TEXT_CHARS)
    except PdfError as error:
        return error_response(error.message, 422)
    return jsonify({"text": text, "truncated": truncated})


@app.post("/api/process")
def api_process():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text")
    mode = payload.get("mode")

    if not isinstance(text, str) or not text.strip():
        return error_response("Teks masih kosong. Tempel materi dulu, ya.", 400)
    text = text.strip()
    if len(text) > MAX_TEXT_CHARS:
        return error_response(f"Teks terlalu panjang. Maksimal {MAX_TEXT_LABEL} karakter.", 413)
    if mode not in MODES:
        return error_response("Mode tidak dikenal. Pilih salah satu mode yang tersedia.", 400)

    try:
        result = process_text(text, mode)
    except AIError as error:
        return error_response(error.message, error.status_code)
    return jsonify({"result": result})


@app.errorhandler(HTTPException)
def handle_http_error(error):
    """Endpoint API selalu membalas JSON, termasuk saat error."""
    if request.path.startswith("/api/"):
        message = HTTP_ERROR_MESSAGES.get(error.code, "Permintaan tidak bisa diproses.")
        return error_response(message, error.code)
    return error


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    """Error tak terduga: catat di log, tampilkan pesan ramah."""
    app.logger.exception("Error tak terduga")
    if request.path.startswith("/api/"):
        return error_response("Terjadi kesalahan di server. Coba lagi sebentar lagi.", 500)
    return "Terjadi kesalahan di server. Coba muat ulang halaman.", 500


if __name__ == "__main__":
    # Port 5001 karena port 5000 di macOS dipakai AirPlay.
    app.run(debug=True, port=5001)
