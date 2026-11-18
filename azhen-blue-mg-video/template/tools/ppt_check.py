# 自动找「PPT 屏」：每屏在 25% / 55% / 85% 处各取一帧，算两两之间的像素差，太接近的屏标出来
# 用法：python3 tools/ppt_check.py 成片或预览.mp4 [阈值，默认 2.0]   依赖 numpy；读 audio/cues.json 和 cues.js 的场景时间
# 差值是 0~255 灰度的平均绝对差，只看内容区（去掉底部字幕和头像），低于阈值说明这一屏几乎没动
import json
import re
import subprocess
import sys

import numpy as np

video = sys.argv[1]
thr = float(sys.argv[2]) if len(sys.argv) > 2 else 2.0
cues = json.loads(re.sub(r"^window\.CUES = |;\s*$", "", open("cues.js").read()))
W, H = 270, 480


def frame(t):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", "-vf", f"scale={W}:{H}:force_original_aspect_ratio=disable,format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(H, W).astype(np.float64)
    return a[: int(H * 0.76)]   # 去掉字幕和头像（竖版底部约 24%；横版字幕也在底部）


duration = float(subprocess.check_output([
    "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration",
    "-of", "default=nw=1:nk=1", video], text=True))
bad = []
for s in cues["scenes"]:
    if s["key"] == "end":
        continue
    d = min(s["end"], duration) - s["start"]
    if d < 0.25:
        continue
    fs = [frame(s["start"] + d * k) for k in (0.25, 0.55, 0.85)]
    diffs = [np.abs(fs[i] - fs[j]).mean() for i, j in ((0, 1), (1, 2), (0, 2))]
    flag = max(diffs) < thr
    print(f"{s['key']:8s} 变化 {max(diffs):5.2f}  {'⚠ 像 PPT 屏，三帧几乎一样' if flag else ''}")
    if flag:
        bad.append(s["key"])
print("全部通过" if not bad else f"需要加动作的屏：{'、'.join(bad)}")
