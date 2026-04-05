#!/usr/bin/env bash
# Smoke test: pack the CLI, install in an isolated temp dir, verify it runs.
# This tests the exact artifact users get from `npm install`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(mktemp -d)"

cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

echo "==> Building..."
(cd "$PKG_DIR" && npm run build --silent)

echo "==> Packing..."
TARBALL=$(cd "$PKG_DIR" && npm pack --silent 2>/dev/null)
mv "$PKG_DIR/$TARBALL" "$WORK_DIR/"

echo "==> Installing from tarball in isolated directory..."
(cd "$WORK_DIR" && npm init -y --silent >/dev/null 2>&1 && npm install "./$TARBALL" --silent 2>/dev/null)

echo "==> Testing --version..."
VERSION=$(cd "$WORK_DIR" && npx existentialburn --version 2>/dev/null)
if [ -z "$VERSION" ]; then
  echo "FAIL: --version produced no output"
  exit 1
fi
echo "    Got version: $VERSION"

echo "==> Testing --help..."
HELP=$(cd "$WORK_DIR" && npx existentialburn --help 2>/dev/null)
if ! echo "$HELP" | grep -q "Extract"; then
  echo "FAIL: --help missing expected content"
  exit 1
fi
echo "    --help output looks good"

echo "==> Testing error path (no Claude data)..."
# Override HOME so the CLI can't find ~/.claude/projects/
FAKE_HOME="$(mktemp -d)"
if cd "$WORK_DIR" && HOME="$FAKE_HOME" npx existentialburn 2>/dev/null; then
  rm -rf "$FAKE_HOME"
  echo "FAIL: expected non-zero exit when no Claude data present"
  exit 1
fi
rm -rf "$FAKE_HOME"
echo "    Correctly errored with no Claude data"

echo ""
echo "All smoke tests passed."
