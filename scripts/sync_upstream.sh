#!/usr/bin/env bash
set -euo pipefail

# Keep local main current, then merge upstream/main.

git fetch upstream
git checkout main
git pull --ff-only origin main
git merge --no-edit upstream/main

echo "Upstream merge complete on main."
