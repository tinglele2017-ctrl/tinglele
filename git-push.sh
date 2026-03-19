#!/bin/bash
# git-push.sh - Auto push changes to GitHub
# Usage: ./git-push.sh [commit message]
set -e

export PATH="$HOME/bin:$PATH"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Default commit message
MSG="${1:-Auto update: $(date '+%Y-%m-%d %H:%M')}"

# Stage all changes
git add -A

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "✅ No changes to push."
    exit 0
fi

# Commit and push
git commit -m "$MSG"
git push origin main

echo "✅ Pushed to GitHub: $MSG"
echo "🌐 Live at: https://tinglele2017-ctrl.github.io/tinglele/"
