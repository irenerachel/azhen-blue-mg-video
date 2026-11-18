# 逐帧渲染：本地 http 服务 + Playwright(Chrome) 调 window.seek(t)，canvas 帧直送 ffmpeg(x264)
# 用法:
#   python render.py <工程目录> frames 1.0 5.5 ...      抽指定秒数的帧到 qa/frames/
#   python render.py <工程目录> preview out.mp4 [workers]  开头 15 秒，1080p30
#   python render.py <工程目录> video out.mp4 [workers]  1080p30 全片（分块并行后无损拼接，再混入 audio/mix.wav）
#   LAYOUT=h 出横版（竖版 1080×1920 / 横版 1920×1080，SCALE=1.3333 都出 2K）
import base64
import functools
import http.server
import json
import math
import os
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(sys.argv[1]).resolve()
MODE = sys.argv[2]
# 环境变量 FPS=50 SCALE=1.3333 出 2K 正式片（默认 1080p30 样片）
FPS = 30 if MODE == "preview" else int(os.environ.get("FPS", 30))


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


PORT = serve()
# 环境变量 THEME=light 渲浅色版
# 环境变量 PAGE 换引擎页面（默认 index.html），END 只渲到某一秒（样片用）
URL = f"http://127.0.0.1:{PORT}/{os.environ.get('PAGE', 'index.html')}?render=1" + (f"&theme={os.environ['THEME']}" if os.environ.get("THEME") else "") \
    + (f"&scale={os.environ['SCALE']}" if MODE != "preview" and os.environ.get("SCALE") else "") + (f"&mb={os.environ['MB']}&fps={FPS}" if os.environ.get("MB") else "") + (f"&font={os.environ['FONT']}" if os.environ.get("FONT") else "") \
    + ("&layout=h" if os.environ.get("LAYOUT") == "h" else "")
# 环境变量 LAYOUT=h 出横版（1920×1080 设计稿），抽帧放到 qa/frames_h/
HZ = os.environ.get("LAYOUT") == "h"


def open_page(p):
    b = p.chromium.launch(channel="chrome", args=["--force-color-profile=srgb"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080} if HZ else {"width": 1080, "height": 1920}, device_scale_factor=1)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL)
    pg.wait_for_function("window.READY === true || window.__err", timeout=120000)
    if pg.evaluate("window.__err"):
        raise SystemExit("资源加载失败: " + pg.evaluate("window.__err"))
    if errs:
        raise SystemExit("页面错误: " + "; ".join(errs))
    return b, pg


GRAB = "t => { (window.seekMB || seek)(t); return document.getElementById('cv').toDataURL('image/png'); }"


def frame_png(pg, t):
    return base64.b64decode(pg.evaluate(GRAB, t).split(",", 1)[1])


def render_chunk(args):
    k, f0, f1, out = args
    enc = subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)],
        stdin=subprocess.PIPE)
    with sync_playwright() as p:
        b, pg = open_page(p)
        for f in range(f0, f1):
            enc.stdin.write(frame_png(pg, f / FPS))
            if (f - f0) % 300 == 0:
                print(f"  chunk {k}: {f - f0}/{f1 - f0}", flush=True)
        b.close()
    enc.stdin.close(); enc.wait()
    return out


if MODE == "frames":
    qa = ROOT / ("qa/frames_h" if HZ else "qa/frames"); qa.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b, pg = open_page(p)
        for s in sys.argv[3:]:
            (qa / f"f_{float(s):06.2f}.png").write_bytes(frame_png(pg, float(s)))
        b.close()
    print("ok")
elif MODE in ("preview", "video"):
    out = ROOT / sys.argv[3]
    workers = int(sys.argv[4]) if len(sys.argv) > 4 else 4
    if MODE == "video" and os.environ.get("END"):
        total = float(os.environ["END"])
    else:
        total = json.loads((ROOT / "audio/cues.json").read_text())["total"]
        if MODE == "preview":
            total = min(total, 15.0)
    n = math.ceil(total * FPS)
    tmp = ROOT / "build"; tmp.mkdir(exist_ok=True)
    step = math.ceil(n / workers)
    jobs = [(k, k * step, min(n, (k + 1) * step), tmp / f"chunk{k}.mp4") for k in range(workers) if k * step < n]
    with ThreadPoolExecutor(workers) as ex:
        parts = list(ex.map(render_chunk, jobs))
    (tmp / "list.txt").write_text("".join(f"file '{p.name}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
                    "-i", str(ROOT / "audio/mix.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "256k", "-t", str(total), "-shortest", "-movflags", "+faststart", str(out)], check=True)
    print("done", out)
