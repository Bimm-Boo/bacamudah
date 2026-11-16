"""Ekstraksi teks dari file PDF."""

import logging
import re

from pypdf import PdfReader

logger = logging.getLogger(__name__)

EMPTY_PDF_MESSAGE = "Teks tidak terbaca dari PDF ini. Coba salin teksnya secara manual."


class PdfError(Exception):
    """Error PDF yang pesannya aman ditampilkan ke pengguna."""

    def __init__(self, message):
        super().__init__(message)
        self.message = message


def _clean_text(text):
    """Rapikan spasi dan baris kosong berlebih dari hasil ekstraksi."""
    text = text.replace("\x00", "")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    cleaned = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def extract_text(file_stream, max_chars):
    """Ambil teks dari PDF.

    Mengembalikan (teks, terpotong). Teks dipotong di max_chars karakter,
    dan halaman berikutnya tidak dibaca lagi agar proses tetap cepat.
    """
    try:
        reader = PdfReader(file_stream)
        if reader.is_encrypted and not reader.decrypt(""):
            raise PdfError("PDF ini dikunci kata sandi. Buka kuncinya dulu, lalu unggah lagi.")

        pages = []
        total_chars = 0
        for page in reader.pages:
            page_text = page.extract_text() or ""
            pages.append(page_text)
            total_chars += len(page_text)
            if total_chars > max_chars:
                break
    except PdfError:
        raise
    except Exception as error:  # PDF rusak bisa memunculkan berbagai jenis error
        logger.warning("Gagal membaca PDF: %s", error)
        raise PdfError("File PDF tidak bisa dibaca. Pastikan file tidak rusak.") from error

    text = _clean_text("\n\n".join(pages))
    if not text:
        raise PdfError(EMPTY_PDF_MESSAGE)

    truncated = len(text) > max_chars
    return text[:max_chars].rstrip(), truncated
