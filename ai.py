"""Pemanggil Gemini API: mengolah materi (4 mode) dan membuat kuis."""

import json
import logging
import os
import random
import re
import time

from google import genai
from google.genai import errors, types

from prompts import SYSTEM_INSTRUCTION, build_define_prompt, build_prompt, build_quiz_prompt

DEFAULT_MODEL = "gemini-3.5-flash-lite"
REQUEST_TIMEOUT_MS = 60_000  # batas tunggu jawaban AI (60 detik)
API_ATTEMPTS = 2  # jika Gemini sedang sibuk (error 5xx), coba ulang sekali
RETRY_DELAY_SECONDS = 2

QUIZ_MIN_QUESTIONS = 3
QUIZ_MAX_QUESTIONS = 5
QUIZ_OPTION_COUNT = 4
QUIZ_ATTEMPTS = 2  # jika jawaban AI tidak valid, coba ulang sekali

# Bentuk JSON kuis yang diminta dari Gemini (sama dengan skema di CLAUDE.md).
QUIZ_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "questions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "question": {"type": "STRING"},
                    "options": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "answer_index": {"type": "INTEGER"},
                    "explanation": {"type": "STRING"},
                },
                "required": ["question", "options", "answer_index", "explanation"],
            },
        }
    },
    "required": ["questions"],
}

# Awalan huruf pada pilihan jawaban, misalnya "A. " atau "b) ".
OPTION_PREFIX = re.compile(r"^\(?([A-Da-d])[.)]\s+")

logger = logging.getLogger(__name__)
_client = None


class AIError(Exception):
    """Error yang pesannya aman dan ramah untuk ditampilkan ke pengguna."""

    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ----- Memanggil Gemini -----
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


def _send(client, model, prompt, config):
    """Kirim satu permintaan ke Gemini. Jika Gemini sedang sibuk (error 5xx), coba ulang sekali."""
    for attempt in range(1, API_ATTEMPTS + 1):
        try:
            return client.models.generate_content(model=model, contents=prompt, config=config)
        except errors.ServerError as error:
            if attempt == API_ATTEMPTS:
                raise
            logger.warning(
                "Gemini sibuk (error %s), coba ulang dalam %d detik", error.code, RETRY_DELAY_SECONDS
            )
            time.sleep(RETRY_DELAY_SECONDS)


def _generate(prompt, temperature, **config_options):
    """Kirim prompt ke Gemini dan kembalikan teks jawabannya."""
    client = _get_client()
    model = os.getenv("GEMINI_MODEL") or DEFAULT_MODEL
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=temperature,
        **config_options,
    )
    try:
        response = _send(client, model, prompt, config)
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
    return response.text


# ----- Mengolah materi (4 mode) -----
def clean_output(text):
    """Rapikan jawaban AI: buang simbol markdown dan samakan tanda poin.

    Tanda **istilah** dipertahankan karena dipakai untuk menebalkan istilah penting,
    kecuali jika tandanya tidak berpasangan dalam satu baris.
    """
    lines = []
    for line in text.strip().splitlines():
        line = line.replace("__", "")
        if line.count("**") % 2:
            line = line.replace("**", "")
        line = re.sub(r"^\s*#+\s*", "", line)  # judul markdown "# ..."
        line = re.sub(r"^\s*[*•]\s+", "- ", line)  # poin "*" atau "•" menjadi "- "
        lines.append(line.rstrip())
    cleaned = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def process_text(text, mode):
    """Olah materi sesuai mode, lalu kembalikan hasilnya sebagai teks."""
    # Suhu rendah agar hasil tetap setia pada materi.
    return clean_output(_generate(build_prompt(mode, text), temperature=0.3))


# ----- Kamus kontekstual -----
def define_term(term, context):
    """Kembalikan arti singkat sebuah istilah sesuai kalimat tempat istilah itu muncul."""
    raw = _generate(build_define_prompt(term, context), temperature=0.2, max_output_tokens=256)
    # Cukup satu paragraf pendek tanpa tanda tebal.
    return " ".join(clean_output(raw).replace("**", "").split())


# ----- Kuis -----
def _strip_option_prefixes(options):
    """Buang awalan "A." sampai "D." jika keempat pilihan memakainya secara berurutan."""
    matches = [OPTION_PREFIX.match(option) for option in options]
    if all(matches) and "".join(match.group(1).upper() for match in matches) == "ABCD":
        return [option[match.end():] for option, match in zip(options, matches)]
    return options


def _clean_question(item):
    """Kembalikan satu soal yang sudah dirapikan, atau None jika bentuknya tidak valid."""
    if not isinstance(item, dict):
        return None
    question = item.get("question")
    options = item.get("options")
    answer_index = item.get("answer_index")
    explanation = item.get("explanation")

    if not all(isinstance(value, str) and value.strip() for value in (question, explanation)):
        return None
    if not isinstance(options, list) or len(options) != QUIZ_OPTION_COUNT:
        return None
    if not all(isinstance(option, str) and option.strip() for option in options):
        return None
    # bool termasuk int di Python, jadi ditolak secara khusus.
    if isinstance(answer_index, bool) or not isinstance(answer_index, int):
        return None
    if not 0 <= answer_index < QUIZ_OPTION_COUNT:
        return None

    options = _strip_option_prefixes([option.strip() for option in options])
    if len({option.lower() for option in options}) != QUIZ_OPTION_COUNT:
        return None  # ada pilihan yang kembar

    # Acak urutan pilihan agar jawaban benar tidak selalu di posisi yang sama.
    order = random.sample(range(QUIZ_OPTION_COUNT), QUIZ_OPTION_COUNT)
    return {
        "question": question.strip(),
        "options": [options[index] for index in order],
        "answer_index": order.index(answer_index),
        "explanation": explanation.strip(),
    }


def parse_quiz(raw_text):
    """Validasi JSON kuis dari AI. Kembalikan daftar soal, atau None jika tidak valid."""
    # Jaga-jaga jika AI membungkus JSON dengan pagar kode markdown.
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text.strip())
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return None

    items = data.get("questions") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return None

    questions = [question for question in map(_clean_question, items) if question]
    if len(questions) < QUIZ_MIN_QUESTIONS:
        return None
    return questions[:QUIZ_MAX_QUESTIONS]


def generate_quiz(text):
    """Minta AI membuat kuis dari materi, lalu kembalikan daftar soal yang sudah divalidasi."""
    prompt = build_quiz_prompt(text)
    for attempt in range(1, QUIZ_ATTEMPTS + 1):
        raw_text = _generate(
            prompt,
            temperature=0.4,
            response_mime_type="application/json",
            response_schema=QUIZ_SCHEMA,
        )
        questions = parse_quiz(raw_text)
        if questions:
            return questions
        logger.warning("Kuis dari AI tidak valid (percobaan %d dari %d)", attempt, QUIZ_ATTEMPTS)

    raise AIError(
        "AI belum berhasil membuat kuis dari materi ini. "
        "Coba lagi, atau pakai materi yang lebih panjang.",
        502,
    )
