# LibTV（Minimax speech-2.8-hd）配音：把逐句 mp3 转成 wav、裁首尾静音，输出与 tts.py 相同格式的 timings.json
# 用法: python libtv_voice.py script.json raw_mp3_dir out_dir
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

script = json.loads(Path(sys.argv[1]).read_text())
raw, out = Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
SR = 32000
timings = []
for i, line in enumerate(script):
    src = raw / f"{i:02d}_{line['key']}.mp3"
    pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(src), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    audio = np.frombuffer(pcm, np.float32)
    nz = np.where(np.abs(audio) > 0.01)[0]
    audio = audio[max(nz[0] - int(0.01 * SR), 0): nz[-1] + int(0.15 * SR)]
    path = out / f"{i:02d}_{line['key']}.wav"
    sf.write(path, audio, SR)
    timings.append({"key": line["key"], "file": path.name, "dur": round(len(audio) / SR, 3)})
    print(path.name, timings[-1]["dur"])
(out / "timings.json").write_text(json.dumps(timings, ensure_ascii=False, indent=1))
