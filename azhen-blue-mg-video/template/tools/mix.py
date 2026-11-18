# 按 cues.json 混音：口播 + 音效（+ 可选背景音乐）→ 48 kHz 立体声，再由 ffmpeg loudnorm 到 −14 LUFS / ≤ −1 dBTP
# 背景音乐：把文件放在 audio/bgm.mp3（或 .wav / .m4a）就会自动混进去：
#   - 比口播低约 BGM_DB 分贝（默认 22，环境变量 BGM_DB 可调，数字越大越小声）；
#   - 说话时再自动压低 DUCK_DB 分贝（默认 6），停顿时回来；
#   - 片头 1.5 秒淡入、片尾 2.5 秒淡出；音乐比片子短时自动循环。
import json
import os
import subprocess
import sys
from math import gcd
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import uniform_filter1d
from scipy.signal import resample_poly

SR = 48000
A = Path(sys.argv[1])
cues = json.loads((A / "cues.json").read_text())
N = int((cues["total"] + 0.5) * SR)
buf = np.zeros(N)
voice = np.zeros(N)
for ev in cues["events"]:
    sr, x = wavfile.read(A / ev["file"])
    x = x / 32768.0 if x.dtype == np.int16 else x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != SR:
        g = gcd(sr, SR); x = resample_poly(x, SR // g, sr // g)
    x = x * ev.get("gain", 1.0)
    i = int(ev["t"] * SR)
    if i < 0:
        x, i = x[-i:], 0
    buf[i:i + len(x)] += x[: N - i]
    if ev.get("kind") == "voice":
        voice[i:i + len(x)] += x[: N - i]

out = np.stack([buf, buf], 1)
bgm = next((A / f"bgm{e}" for e in (".wav", ".mp3", ".m4a", ".flac") if (A / f"bgm{e}").exists()), None)
if bgm:
    pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(bgm), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    m = np.frombuffer(pcm, np.float32).reshape(-1, 2).astype(np.float64)
    reps = int(np.ceil(N / len(m)))
    m = np.tile(m, (reps, 1))[:N]
    # 电平：按口播有声部分的 RMS 定基准
    env = np.sqrt(uniform_filter1d(voice ** 2, int(0.05 * SR)))
    voiced = env > 0.01
    v_rms = np.sqrt((voice[voiced] ** 2).mean()) if voiced.any() else 0.1
    m_rms = np.sqrt((m ** 2).mean()) or 1e-6
    base = v_rms / m_rms * 10 ** (-float(os.environ.get("BGM_DB", 22)) / 20)
    # 说话时压低：有声标记平滑 0.3 秒，过渡不突兀
    duck_db = float(os.environ.get("DUCK_DB", 6))
    talk = uniform_filter1d(voiced.astype(np.float64), int(0.3 * SR))
    g = base * 10 ** (-duck_db * np.clip(talk * 1.5, 0, 1) / 20)
    fi, fo = int(1.5 * SR), int(2.5 * SR)
    g[:fi] *= np.linspace(0, 1, fi)
    g[-fo:] *= np.linspace(1, 0, fo)
    out = out + m * g[:, None]
    print(f"bgm {bgm.name}: 比口播低 {os.environ.get('BGM_DB', 22)} dB，说话时再压 {duck_db} dB")
wavfile.write(A / "mix_raw.wav", SR, out.astype(np.float32))
print("raw peak", np.abs(out).max())
