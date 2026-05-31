#!/usr/bin/env bash
set -euo pipefail

# POSIX build script for SlideForge backend packaging
# Mirrors the Windows PowerShell `build_and_package.ps1` but aims to run on Linux/macOS CI runners.
# Usage: ./build_and_package.sh [--skip-frontend] [--skip-model-bundle] [--backend-dist-path DIST]

SKIP_FRONTEND=0
SKIP_MODEL_BUNDLE=0
BACKEND_DIST_PATH="dist-package"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$SCRIPT_DIR"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-frontend) SKIP_FRONTEND=1; shift ;;
    --skip-model-bundle) SKIP_MODEL_BUNDLE=1; shift ;;
    --backend-dist-path) BACKEND_DIST_PATH="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "script dir: $SCRIPT_DIR"
echo "repo root: $REPO_ROOT"

if [[ $SKIP_FRONTEND -eq 0 ]]; then
  if ! command -v npm &>/dev/null; then
    echo "npm not found. Install Node.js or rerun with --skip-frontend." >&2
    exit 1
  fi
  echo "Building React frontend..."
  cd "$REPO_ROOT"
  npm ci
  npm run build
else
  echo "Skipping React frontend build (already built)."
fi

cd "$BACKEND_DIR"

# Create a unique static build dir
if command -v uuidgen &>/dev/null; then
  STATIC_BUILD_DIR="static_build_$(uuidgen)"
elif [[ -f /proc/sys/kernel/random/uuid ]]; then
  STATIC_BUILD_DIR="static_build_$(cat /proc/sys/kernel/random/uuid)"
else
  STATIC_BUILD_DIR="static_build_$(date +%s)"
fi

mkdir -p "$STATIC_BUILD_DIR"
echo "Copying frontend dist to backend/$STATIC_BUILD_DIR"
cp -r "$REPO_ROOT/dist/." "$STATIC_BUILD_DIR/"

if [[ $SKIP_MODEL_BUNDLE -eq 0 ]]; then
  echo "Preparing bundled OCR models..."
  BUNDLE_TEMP_ROOT="$BACKEND_DIR/model-bundle-ready"
  BUNDLE_OUT_PATH="$BUNDLE_TEMP_ROOT/surya_models"
  mkdir -p "$BUNDLE_TEMP_ROOT"

  # Ensure a venv exists and is activated
  if [[ -f ".venv/bin/activate" ]]; then
    source .venv/bin/activate
  else
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
  fi

  # Prefetch and prepare model bundle (scripts may be no-ops if models are already present)
  python scripts/prefetch_surya_models.py || true
  export SLIDEFORGE_BUNDLE_OUT="$BUNDLE_OUT_PATH"
  python scripts/prepare_model_bundle.py || true
  unset SLIDEFORGE_BUNDLE_OUT || true
else
  echo "Skipping bundled OCR models for lite build."
  rm -rf model-bundle model-bundle-ready || true
fi

# Ensure venv and pyinstaller
if [[ -f ".venv/bin/activate" ]]; then
  source .venv/bin/activate
else
  python3 -m venv .venv
  source .venv/bin/activate
  pip install --upgrade pip
fi

pip install pyinstaller

export SLIDEFORGE_STATIC_DIR="$BACKEND_DIR/$STATIC_BUILD_DIR"
echo "Building Python executable with SLIDEFORGE_STATIC_DIR=$SLIDEFORGE_STATIC_DIR"
pyinstaller SlideForge.spec --clean -y --distpath "$BACKEND_DIST_PATH"
unset SLIDEFORGE_STATIC_DIR

echo "Build complete! The packed folder is in backend/$BACKEND_DIST_PATH/SlideForge"
echo "Run backend/$BACKEND_DIST_PATH/SlideForge/SlideForge (or SlideForge.exe on Windows) to start the application."
