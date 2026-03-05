#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT_DIR/bin/jasper.js"
TARGET="$HOME/bin/jasper"

mkdir -p "$HOME/bin"
ln -sf "$SOURCE" "$TARGET"
chmod +x "$SOURCE"

cat <<'MSG'
Installed jasper command:
  $HOME/bin/jasper -> <repo>/jasper-overlay/bin/jasper.js

If needed, add this to ~/.zshrc:
  export PATH="$HOME/bin:$PATH"
MSG
