#!/usr/bin/env bash
# scripts/bump-version.sh
# Bumps the version in both package.json files, commits, and creates a git tag.
#
# Usage:
#   ./scripts/bump-version.sh <major|minor|patch>
#   ./scripts/bump-version.sh 2.3.0          # explicit version

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

die() { echo "Error: $*" >&2; exit 1; }

# --- Resolve new version ---------------------------------------------------
CURRENT=$(node -p "require('$REPO_ROOT/package.json').version")

case "${1:-}" in
  major|minor|patch)
    IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"
    case "$1" in
      major) NEW="$((MAJ + 1)).0.0" ;;
      minor) NEW="$MAJ.$((MIN + 1)).0" ;;
      patch) NEW="$MAJ.$MIN.$((PAT + 1))" ;;
    esac
    ;;
  [0-9]*)
    NEW="$1"
    # Basic semver check
    [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Invalid semver: $NEW"
    ;;
  *)
    echo "Usage: $0 <major|minor|patch|X.Y.Z>"
    echo "  Current version: $CURRENT"
    exit 1
    ;;
esac

[[ "$NEW" == "$CURRENT" ]] && die "Version $NEW is already current"

echo "Bumping version: $CURRENT -> $NEW"

# --- Update package.json files ---------------------------------------------
cd "$REPO_ROOT"

# Use npm version --no-git-tag-version so we control the commit ourselves
npm version "$NEW" --no-git-tag-version --allow-same-version
cd backend && npm version "$NEW" --no-git-tag-version --allow-same-version
cd "$REPO_ROOT"

# --- Commit and tag ---------------------------------------------------------
git add package.json backend/package.json
git commit -m "chore: bump version to $NEW"
git tag -a "v$NEW" -m "Release v$NEW"

echo ""
echo "Version bumped to $NEW"
echo "  - package.json updated"
echo "  - backend/package.json updated"
echo "  - Commit created"
echo "  - Tag v$NEW created"
echo ""
echo "Next steps:"
echo "  git push origin HEAD && git push origin v$NEW"
