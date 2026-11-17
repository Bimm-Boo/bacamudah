"""Rate limit sederhana: membatasi jumlah permintaan dari satu alamat IP."""

import math
import threading
import time
from collections import deque


class RateLimiter:
    """Menghitung permintaan tiap IP dalam jendela waktu yang bergeser.

    Data disimpan di memori server. Di Vercel bisa ada beberapa server yang
    berjalan bersamaan, jadi batas ini berlaku per server (perkiraan kasar),
    tetapi tetap cukup untuk menahan satu pengunjung yang mengirim terlalu
    banyak permintaan dalam waktu singkat.
    """

    def __init__(self, max_requests, window_seconds):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits = {}  # IP -> waktu-waktu permintaan terakhir
        self._lock = threading.Lock()
        self._last_cleanup = time.monotonic()

    def check(self, key):
        """Catat satu permintaan.

        Kembalikan 0 jika permintaan boleh lanjut, atau jumlah detik yang
        perlu ditunggu jika batas sudah tercapai.
        """
        now = time.monotonic()
        with self._lock:
            self._cleanup(now)
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return max(1, math.ceil(self.window_seconds - (now - hits[0])))
            hits.append(now)
            return 0

    def _cleanup(self, now):
        """Sesekali buang IP yang sudah lama tidak mengirim permintaan agar memori tidak terus bertambah."""
        if now - self._last_cleanup < self.window_seconds:
            return
        self._last_cleanup = now
        stale_keys = [
            key for key, hits in self._hits.items()
            if not hits or now - hits[-1] >= self.window_seconds
        ]
        for key in stale_keys:
            del self._hits[key]
