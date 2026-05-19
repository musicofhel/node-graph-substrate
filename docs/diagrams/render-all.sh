#!/bin/bash
D2=~/.local/bin/d2
DIR="$(dirname "$0")"
for f in "$DIR"/*.d2; do
  out="${f%.d2}.png"
  echo "Rendering $(basename "$f")..."
  $D2 --layout=elk --pad=60 --theme=0 "$f" "$out"
  python3 -c "
from PIL import Image
import numpy as np
img = Image.open('$out').convert('RGBA')
data = np.array(img)
dark = np.array([30, 30, 46])
mask = np.all(np.abs(data[:,:,:3].astype(int) - 255) < 15, axis=2)
data[mask, :3] = dark
Image.fromarray(data).save('$out')
"
done
echo "Done: $(ls "$DIR"/*.png | wc -l) diagrams rendered."
