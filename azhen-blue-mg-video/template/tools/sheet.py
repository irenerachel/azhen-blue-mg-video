# 抽帧拼联系表：python sheet.py 输出.png 秒数...（先跑 render.py frames 同样的秒数）  依赖 pillow
# LAYOUT=h 时读 qa/frames_h/ 的横版帧
import os, sys
from PIL import Image
out, ts = sys.argv[1], sys.argv[2:]
d = "qa/frames_h" if os.environ.get("LAYOUT") == "h" else "qa/frames"
tw_, th_ = (480, 270) if os.environ.get("LAYOUT") == "h" else (300, 533)
ims = [Image.open(f"{d}/f_%06.2f.png" % float(t)).convert("RGB").resize((tw_, th_)) for t in ts]
cols = 4 if os.environ.get("LAYOUT") == "h" else len(ims)
rows = (len(ims) + cols - 1) // cols
o = Image.new("RGB", ((tw_ + 6) * cols, (th_ + 6) * rows), "white")
for i, im in enumerate(ims): o.paste(im, ((i % cols) * (tw_ + 6), (i // cols) * (th_ + 6)))
o.save(out); print(out)
