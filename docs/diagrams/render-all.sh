#!/bin/bash
D2=~/.local/bin/d2
DIR="$(dirname "$0")"
for f in "$DIR"/*.d2; do
  out="${f%.d2}.png"
  echo "Rendering $(basename "$f")..."
  $D2 --layout=elk --pad=60 "$f" "$out"
done
echo "Done: $(ls "$DIR"/*.png | wc -l) diagrams rendered."
