# 用 faster-whisper 词时间戳把口播转成 cue 表：场景边界、字幕整行时间、口播标记、音效时间
# 输出 cues.js（引擎读）与 audio/cues.json（混音读），并打印转写结果供核对发音
import json
import math
import re
import sys
from pathlib import Path

import jieba
from faster_whisper import WhisperModel

ROOT = Path(sys.argv[1])
script = json.loads((ROOT / "script.json").read_text())
timings = json.loads((ROOT / "audio/voice/timings.json").read_text())
model = WhisperModel("small", device="cpu", compute_type="int8")

FPS = 30
LEAD = 0.3             # 片头到第一句口播
VOICE_IN = 0.12        # 场景边界到口播开始
GAP = 0.18             # 句间停顿
# 每句口播后多停多久，由 script.json 的 "extra" 指定（小动画、卡片演变后多停一会儿）
MIN_SCENE = 2.8        # 一屏最短时长
END_HOLD = 2.6


def norm(s):
    return re.sub(r"[\s，。、！？,.!?：:]", "", s).lower()


def char_times(sentence, wav):
    """原句每个（去标点后）字符 → 口播内时间。whisper 文本按长度比例对齐。"""
    # 不给 initial_prompt：MiniMax 配音下 whisper 会把与提示重合的前半句吞掉
    segs, _ = model.transcribe(str(wav), language="zh", word_timestamps=True)
    words = [w for s in segs for w in s.words]
    heard = "".join(w.word for w in words)
    spans = []
    for w in words:
        for _ in norm(w.word):
            spans.append(w.start)
    o = norm(sentence)
    if not spans:
        return heard, None
    return heard, [spans[min(int(i * len(spans) / len(o)), len(spans) - 1)] for i in range(len(o))]


def pos_of(sentence, sub):
    """子串在去标点原句中的字符序号"""
    i = sentence.index(sub)
    return len(norm(sentence[:i]))


MAX_UNITS = 11   # 字幕一行最多约 11 个汉字宽（52 px × 11 ≈ 572 px < 字幕槽 610 px）


def units(s):
    return sum(1.0 if ord(ch) > 0x2E80 else (0.3 if ch == " " else 0.55) for ch in s)


KEEP = json.loads((ROOT / "keep.json").read_text()) if (ROOT / "keep.json").exists() else []   # 不能从中间拆开的专有名词（本片在 keep.json 里列）


def breakpoints(s):
    """可断行的位置：jieba 分词边界，排除专有名词内部"""
    pos, k = set(), 0
    for w in jieba.cut(s):
        k += len(w); pos.add(k)
    for term in KEEP:
        i = s.find(term)
        while i >= 0:
            pos -= set(range(i + 1, i + len(term)))
            i = s.find(term, i + 1)
    return sorted(p for p in pos if 0 < p < len(s))


def wrap(s):
    """超长字幕在最接近一半宽度的词边界拆开"""
    if units(s) <= MAX_UNITS:
        return [s]
    bps = breakpoints(s)
    if not bps:   # 整个是不能拆的专有名词：保留一行，由引擎兜底缩字
        return [s]
    best = min((abs(units(s[:k]) - units(s) / 2), k) for k in bps)[1]
    return wrap(s[:best].rstrip("，、 ")) + wrap(s[best:].lstrip("，、 "))


scenes, subs, sfx = [], [], []
t = 0.0
for i, (line, tm) in enumerate(zip(script, timings)):
    key, say, d = line["key"], line["say"], tm["dur"]
    heard, ct = char_times(say, ROOT / "audio/voice" / tm["file"])
    print(f"{key:8s} {d:5.2f}s  听写: {heard}")
    vs = LEAD if i == 0 else t + VOICE_IN
    start = 0.0 if i == 0 else t
    marks = {k: vs + ct[pos_of(say, v)] for k, v in line.get("marks", {}).items()}
    # 字幕：先按句号 / 逗号断，再把超过 MAX_UNITS 的长句从中间拆成两行，保证 52 px 字号一行放得下
    if key != "end":
        pieces = []   # (在原句中的起始下标, 文字)
        for m in re.finditer(r"[^，。！？：；]+[，。！？：；]?", say):   # 冒号、分号也断开，标点不留在下一条字幕开头
            if not norm(m.group()):
                continue
            off = m.start()
            for w in wrap(m.group().strip().rstrip("，。：；")):
                j = say.index(w, off)
                pieces.append((j, w)); off = j + len(w)
        starts = [vs] + [vs + ct[min(len(norm(say[:j])), len(ct) - 1)] for j, _ in pieces[1:]]
        for k, (_, w) in enumerate(pieces):
            t1 = starts[k + 1] if k + 1 < len(pieces) else vs + d + 0.25
            subs.append({"t0": round(starts[k] - 0.05, 3), "t1": round(t1 - 0.05, 3), "text": w})
    end_v = vs + d
    nxt = end_v + GAP + line.get("extra", 0)
    nxt = max(nxt, start + MIN_SCENE)
    if key == "end":
        nxt = end_v + END_HOLD
    scenes.append({"key": key, "start": round(start, 3), "end": round(nxt, 3), "vs": round(vs, 3), "vd": d,
                   "marks": {k: round(v, 3) for k, v in marks.items()}, "light": line.get("alt", False)})   # alt：和整片主题相反的纸底，用来换气
    sfx.append({"t": round(vs, 3), "file": "voice/" + tm["file"], "kind": "voice"})
    if i > 0 and not line.get("noflip"):   # noflip：这次转场不加转场音，控制音效总数
        # 木质轻敲：撞击类，对齐新页首次可见的帧
        sfx.append({"t": round(start - 0.45, 3), "file": "sfx/woodtap.wav", "kind": "sfx", "gain": 0.45})
    # 小动画等音效：script.json 里 "sfx" 写在口播标记之后 offset 秒，或场景开始后 start 秒
    for fx in line.get("sfx", []):
        t_fx = marks[fx["mark"]] + fx.get("offset", 0) if "mark" in fx else start + fx["start"]
        sfx.append({"t": round(t_fx, 3), "file": fx["file"], "kind": "sfx", "gain": fx.get("gain", 0.4)})
    t = nxt

total = round(t, 3)
for k, s in enumerate(scenes):
    s["end"] = scenes[k + 1]["start"] if k + 1 < len(scenes) else total
n_sfx = len([s for s in sfx if s["kind"] == "sfx"])
print(f"total {total:.2f}s  音效 {n_sfx} 个（上限 {math.ceil(total / 6)}）")
all_text = "".join(l["say"] for l in script)
cues = {"total": total, "fps": FPS, "scenes": scenes, "subs": subs, "allText": all_text}
(ROOT / "cues.js").write_text("window.CUES = " + json.dumps(cues, ensure_ascii=False, indent=1) + ";\n")
(ROOT / "audio/cues.json").write_text(json.dumps({"total": total, "events": sfx}, ensure_ascii=False, indent=1))
