"""Pengaturan gunicorn (server produksi).

File ini dibaca otomatis saat server dijalankan dengan perintah: gunicorn app:app
"""

import os

# Render memberi tahu nomor port lewat variabel lingkungan PORT.
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# Satu proses dengan beberapa thread: hemat memori (paket gratis Render 512 MB)
# dan tetap bisa melayani beberapa pengunjung sekaligus saat menunggu jawaban AI.
workers = 1
threads = 8

# Jawaban AI bisa butuh puluhan detik, jadi batas waktu dinaikkan dari bawaan 30 detik.
timeout = 120

# Catat setiap permintaan ke log (terlihat di dashboard Render).
accesslog = "-"
