#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_dir="$root/work/piper"
python="${PYTHON:-python3}"
venv="$install_dir/venv"
mkdir -p "$install_dir/voices"

if command -v uv >/dev/null 2>&1; then
  uv venv --allow-existing --python "$python" "$venv"
  uv pip install --python "$venv/bin/python" piper-tts
else
  "$python" -m venv "$venv"
  "$venv/bin/python" -m pip install piper-tts
fi

if (( $# == 0 )); then set -- en_US-lessac-medium; fi
"$venv/bin/python" -m piper.download_voices --data-dir "$install_dir/voices" -- "$@"
