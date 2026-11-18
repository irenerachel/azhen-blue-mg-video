# 把 GIF 拆成横排帧图 + 帧时长，供引擎逐帧播放：python gif2sprite.py 输入目录 输出目录 [最长边，默认 360]
# 输出：<名>.sprite.png（所有帧按 8 列网格排）和 gifs.js（window.GIFS = {名: {n, w, h, d:[每帧秒数]}}）   依赖 pillow
import json, sys
from pathlib import Path
from PIL import Image, ImageSequence
src, out = Path(sys.argv[1]), Path(sys.argv[2]); mx = int(sys.argv[3]) if len(sys.argv) > 3 else 360
out.mkdir(parents=True, exist_ok=True); meta = {}
for g in sorted(src.glob("*.gif")):
    im = Image.open(g); frames, durs = [], []
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert("RGBA")); durs.append(max(0.02, fr.info.get("duration", 80) / 1000))
    k = mx / max(frames[0].size); w, h = round(frames[0].width * k), round(frames[0].height * k)
    step = max(1, len(frames) // 48)   # 帧太多时抽稀，单张图不超过约 48 帧
    sel = list(range(0, len(frames), step)); d = [sum(durs[i:i + step]) for i in sel]
    cols = 8; rows = (len(sel) + cols - 1) // cols   # 网格排列，避免超过浏览器图片宽度上限
    sheet = Image.new("RGBA", (w * cols, h * rows))
    for j, i in enumerate(sel): sheet.paste(frames[i].resize((w, h), Image.LANCZOS), ((j % cols) * w, (j // cols) * h))
    sheet.save(out / f"{g.stem}.sprite.png"); meta[g.stem] = {"n": len(sel), "w": w, "h": h, "cols": cols, "d": [round(x, 3) for x in d]}
    print(g.stem, len(frames), "帧 →", len(sel), f"{w}x{h}", f"一圈 {sum(d):.1f}s")
(out / "gifs.js").write_text("window.GIFS = " + json.dumps(meta) + ";\n")
