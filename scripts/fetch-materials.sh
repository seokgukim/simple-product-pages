#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [ -n "${NODE_BIN}" ]; then
  echo "[fetch-materials] Running Node generator"
  cd "$ROOT_DIR"
  node ./scripts/generate-data.mjs
  exit $?
fi

if [ -z "${GOOGLE_DRIVE_SHARED_ENDPOINT:-}" ]; then
  echo "[fetch-materials] GOOGLE_DRIVE_SHARED_ENDPOINT not set. Exiting."
  exit 0
fi

TMP_DIR="$(mktemp -d)"
OUT_DIR="$ROOT_DIR/public/data"
mkdir -p "$OUT_DIR"

URL="$GOOGLE_DRIVE_SHARED_ENDPOINT"
TMP_FILE="$TMP_DIR/data.download"

echo "[fetch-materials] Downloading $URL to $TMP_FILE"
# follow redirects, fail on HTTP errors
curl -L --fail -o "$TMP_FILE" "$URL"

# Try unzip, else copy file
if file "$TMP_FILE" | grep -qi 'Zip archive'; then
  echo "[fetch-materials] Extracting zip to $OUT_DIR"
  unzip -o "$TMP_FILE" -d "$OUT_DIR"
else
  echo "[fetch-materials] Unknown filetype, saving to $OUT_DIR"
  cp "$TMP_FILE" "$OUT_DIR/"
fi

echo "[fetch-materials] Done"
exit 0
