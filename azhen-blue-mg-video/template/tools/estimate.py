# 配音前预估时长：按字数估每句口播时长，加上句间停顿，算出全片大约多长，并给出建议语速
# 用法：python3 tools/estimate.py script.json [目标秒数，默认 80]
# 口径：普通话参考语速约每秒 4.8 个汉字（英文单词按 1.5 个字、数字按位数计），
#       逗号顿号约 0.18 秒、句号问号约 0.3 秒；句间停顿和片尾停留与 build_cues.py 一致。
import json
import re
import sys

script = json.loads(open(sys.argv[1]).read())
target = float(sys.argv[2]) if len(sys.argv) > 2 else 80
CPS, GAP, VOICE_IN, MIN_SCENE, END_HOLD = 4.8, 0.18, 0.12, 2.8, 2.6


def units(s):
    words = re.findall(r"[A-Za-z]+", s)
    digits = re.findall(r"\d", s)
    han = re.findall(r"[一-鿿]", s)
    return len(han) + 1.5 * len(words) + 0.6 * len(digits)


def pauses(s):
    return 0.18 * len(re.findall(r"[，、：；]", s)) + 0.3 * len(re.findall(r"[。？！]", s[:-1]))


def total(speed):
    t = 0.3
    for i, l in enumerate(script):
        d = units(l["say"]) / (CPS * speed) + pauses(l["say"]) / speed
        if l["key"] == "end":
            t += d + END_HOLD
        else:
            t += max(d + VOICE_IN + GAP + l.get("extra", 0), MIN_SCENE)
    return t


for i, l in enumerate(script):
    print(f"{i:02d} {l['key']:8s} {units(l['say']):5.1f} 字  约 {units(l['say']) / CPS + pauses(l['say']):4.1f} 秒")
for sp in (1.0, 1.1, 1.2):
    print(f"语速 {sp}：全片约 {total(sp):.0f} 秒")
best = min((abs(total(sp / 100) - target), sp / 100) for sp in range(90, 126, 5))[1]
t = total(best)
print(f"目标 {target:.0f} 秒 → 建议语速 {best}（约 {t:.0f} 秒）" + ("；超出较多，建议删一两句" if t > target * 1.08 else ""))
