# 从配音算头像口型包络 → mouth.js（引擎 drawAvatar 读 window.MOUTH）
# 用法: python make_mouth.py <工程目录>     依赖 numpy scipy
import json, sys
from math import gcd
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

ROOT = Path(sys.argv[1])
cues = json.loads((ROOT / "audio/cues.json").read_text())
SR, FPS = 16000, 50
buf = np.zeros(int((cues["total"] + 0.5) * SR))
for ev in cues["events"]:
    if ev.get("kind") != "voice":
        continue
    sr, x = wavfile.read(ROOT / "audio" / ev["file"]); x = x.astype(np.float64)
    if np.abs(x).max() > 2: x /= 32768
    if x.ndim > 1: x = x.mean(1)
    g = gcd(sr, SR); x = resample_poly(x, SR // g, sr // g); i = int(ev["t"] * SR)
    buf[i:i + len(x)] += x[:len(buf) - i]
hop = SR // FPS; n = len(buf) // hop
rms = np.array([np.sqrt(np.mean(buf[k * hop:(k + 1) * hop] ** 2)) for k in range(n)])
ref = np.percentile(rms[rms > 0.005], 90); v = np.clip(rms / ref, 0, 1); v = np.where(v < 0.12, 0, v)
(ROOT / "mouth.js").write_text("window.MOUTH = " + json.dumps({"fps": FPS, "v": [round(float(a), 2) for a in v]}) + ";\n")
print("mouth.js", n, "帧，说话占比", round(float((v > 0).mean()), 2))
