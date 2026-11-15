"""EXR -> .npy (float16, top row first), with bpy (the venv that renders): python exr.py DIR"""
import glob
import os
import sys

import bpy
import numpy as np

d = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else sys.argv[1]
for f in sorted(glob.glob(os.path.join(d, '*.exr'))):
    out = f[:-4] + '.npy'
    if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(f):
        continue
    img = bpy.data.images.load(f)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::-1]
    np.save(out, a.astype(np.float16))
    bpy.data.images.remove(img)
    print('npy', os.path.basename(out), w, h)
