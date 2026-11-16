"""Pemanggil Gemini API untuk mengolah materi."""

import logging
import os
import re

from google import genai
from google.genai import errors, types

from prompts import SYSTEM_INSTRUCTION, build_prompt

DEFAULT_MODEL = "gemini-3.5-flash-lite"
REQUEST_TIMEOUT_MS = 60_000  # batas tunggu jawaban AI (60 detik)

logger = logging.getLogger(__name__)
_client = None


class AIError(Exception):
    """Error yang pesannya aman dan ramah untuk ditampilkan ke pengguna."""

    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _get_client():
    """Buat client Gemini sekali saja, lalu pakai ulang."""
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise AIError(
                "Layanan AI belum diatur. Pemilik website perlu mengisi GEMINI_API_KEY.",
                503,
            )
        _client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
        )
    return _client


def _friendly_api_error(error):
    """Ubah error dari Gemini menjadi pesan yang mudah dipahami."""
    if error.code == 429:
        return AIError("Kuota AI sedang penuh. Tunggu sekitar satu menit, lalu coba lagi.", 429)
    if error.code in (400, 401, 403) and "API key" in (error.message or ""):
        return AIError(
            "Layanan AI belum bisa dipakai karena API key tidak valid. "
            "Pemilik website perlu memeriksanya.",
            503,
        )
    if error.code == 404:
        return AIError(
            "Model AI tidak ditemukan. Pemilik website perlu memeriksa GEMINI_MODEL.", 503
        )
    if error.code >= 500:
        return AIError("Layanan AI sedang sibuk. Coba lagi sebentar lagi.", 503)
    return AIError("AI tidak bisa memproses permintaan ini. Coba lagi sebentar lagi.", 502)


def clean_output(text):
    """Rapikan jawaban AI: buang simbol markdown dan samakan tanda poin."""
    lines = []
    for line in text.strip().splitlines():
        line = line.replace("**", "").replace("__", "")
        line = re.sub(r"^\s*#+\s*", "", line)  # judul markdown "# ..."
        line = re.sub(r"^\s*[*•]\s+", "- ", line)  # poin "*" atau "•" menjadi "- "
        lines.append(line.rstrip())
    cleaned = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def process_text(text, mode):
    """Kirim materi ke Gemini sesuai mode, lalu kembalikan hasilnya sebagai teks."""
    client = _get_client()
    model = os.getenv("GEMINI_MODEL") or DEFAULT_MODEL
    try:
        response = client.models.generate_content(
            model=model,
            contents=build_prompt(mode, text),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.3,  # rendah agar hasil tetap setia pada materi
            ),
        )
    except errors.APIError as error:
        logger.warning("Gemini API error %s: %s", error.code, error.message)
        raise _friendly_api_error(error) from error
    except Exception as error:  # misalnya koneksi putus atau waktu habis
        logger.exception("Gagal menghubungi Gemini")
        raise AIError(
            "Tidak bisa terhubung ke layanan AI. Coba lagi sebentar lagi.", 504
        ) from error

    if not response.text or not response.text.strip():
        raise AIError(
            "AI tidak memberikan jawaban untuk materi ini. Coba ubah atau persingkat materinya.",
            502,
        )
    return clean_output(response.text)
