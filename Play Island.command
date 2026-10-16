#!/bin/bash
# Double-click to play: installs once, starts the game server, opens your browser.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
(sleep 2; open "http://localhost:5199") &
npx vite --port 5199
