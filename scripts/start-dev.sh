#!/usr/bin/env bash
set -e

echo "================================"
echo "  Lyric Glass Card Dev Server"
echo "================================"
echo

if [ ! -f "package.json" ]; then
  echo "[Error] package.json was not found."
  echo "Please run this script from the project root."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[Error] Node.js was not found."
  echo "Please install Node.js LTS: https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[Error] npm was not found."
  echo "Please confirm Node.js is installed correctly."
  exit 1
fi

echo "[Info] Node version:"
node -v
echo "[Info] npm version:"
npm -v
echo

if [ ! -d "node_modules" ]; then
  echo "[Info] node_modules was not found. Installing dependencies..."
  npm install
else
  echo "[Info] node_modules found. Skipping dependency install."
fi

echo
echo "[Info] Starting development server..."
echo "[Info] Default URL: http://localhost:3000"
echo
npm run dev
