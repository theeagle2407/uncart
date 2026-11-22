#!/bin/bash
set +x
cd -P "$(dirname "$0")" || exit 1
if [[ -r "$HOME/.nvm/nvm.sh" ]]; then
  . "$HOME/.nvm/nvm.sh" --no-use
  if nvm which 26 >/dev/null 2>&1; then nvm use 26 >/dev/null || exit 1; fi
fi
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)'; then
  printf '%s\n' 'Uncart needs Node 22 or later. In the Terminal where you installed OpenClaw, use nvm use 26 and rerun this launcher.' >&2
  exit 1
fi
if command -v openclaw >/dev/null; then
  if [[ -z "$CEREBRAS_API_KEY" && -t 0 ]]; then
    IFS= read -r -s -p 'Cerebras API key (hidden; Return for worked examples only): ' UNCART_KEY_INPUT
    printf '\n'
    if [[ -n "$UNCART_KEY_INPUT" ]]; then export CEREBRAS_API_KEY="$UNCART_KEY_INPUT"; fi
    unset UNCART_KEY_INPUT
  fi
else
  printf '%s\n' 'OpenClaw is not on PATH; worked examples are available. For live checks, launch from your hackathon Terminal tab.'
fi
exec node server.mjs --open
