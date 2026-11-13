#!/usr/bin/env bash
set -Eeuo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == --help ]]; then
  echo 'Usage: bash scripts/reset-extension.sh'
  echo 'Deletes extension/shared build outputs, reinstalls dependencies, and purges ~/.scrimba courses, recordings, downloads, and workspace snapshots.'
  echo 'Saved login is cleared on the next activation. Close Extension Development Host windows before running; press F5 afterward.'
  echo 'Source files, .env files, bun.lock, and unrelated editor data are preserved.'
  exit 0
fi
[[ $# == 0 ]] || { echo 'Unexpected argument; use --help.' >&2; exit 1; }
command -v bun >/dev/null
[[ -n "${HOME:-}" && "$HOME" != / ]] || { echo 'HOME must be a user home directory.' >&2; exit 1; }
printf 'Purging extension builds and all Scrimba lessons, recordings, snapshots, and login state.\n'
rm -rf -- extension/dist extension/tsconfig.tsbuildinfo packages/shared/dist packages/shared/tsconfig.tsbuildinfo .vscode-test
rm -rf -- "$HOME/.scrimba"
mkdir -p -- "$HOME/.scrimba"
# SecretStorage belongs to the editor. Ask the extension to erase only its own
# saved token on activation rather than modifying the editor's shared database.
touch -- "$HOME/.scrimba/.reset-auth"
rm -rf -- node_modules backend/node_modules extension/node_modules packages/shared/node_modules
reset_cache="$(mktemp -d)"
trap 'rm -rf -- "$reset_cache"' EXIT
bun install --frozen-lockfile --force --no-cache --cache-dir "$reset_cache"
bun run build:extension
printf 'Extension rebuilt. Start a NEW Extension Development Host with F5.\n'
