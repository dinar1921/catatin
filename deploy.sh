#!/usr/bin/env bash
# =====================================================================
# Catatin — manual deploy ke server (jalankan di server home).
#   chmod +x deploy.sh
#   ./deploy.sh
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Pull kode terbaru"
git pull --ff-only

echo "==> Siapkan .env bila belum ada"
[ -f .env ] || cp .env.example .env

echo "==> Build & jalankan container"
docker compose build
docker compose up -d

echo "==> Bersihkan image lama"
docker image prune -f

echo "==> Selesai. Cek: docker compose logs -f catatin"
