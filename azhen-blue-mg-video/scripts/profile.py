"""在接收者本机保存称呼和角色参考，并将品牌素材复制到单片工程。"""
import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path

DATA = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "blue-mg-video"
PROFILE = DATA / "profile.json"


def save(name, source):
    name = name.strip()
    if not name:
        raise ValueError("请提供希望使用的称呼")
    raw = source.read_bytes()
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = ".png"
    elif raw.startswith(b"\xff\xd8\xff"):
        ext = ".jpg"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        ext = ".webp"
    else:
        raise ValueError("请提供 PNG、JPEG 或 WebP 图片")
    directory = DATA / "characters" / hashlib.sha256(raw).hexdigest()
    directory.mkdir(parents=True, exist_ok=True)
    sheet = directory / ("reference" + ext)
    sheet.write_bytes(raw)
    profile = read() or {}
    profile.update(name=name, reference=str(sheet))
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=DATA, delete=False) as out:
        json.dump(profile, out, ensure_ascii=False, indent=2)
    os.replace(out.name, PROFILE)
    return profile


def read():
    if PROFILE.is_file():
        profile = json.loads(PROFILE.read_text(encoding="utf-8"))
        if profile.get("name", "").strip() and Path(profile.get("reference", "")).is_file():
            return profile


def apply(profile, project):
    if not profile:
        raise ValueError("请先设置称呼和角色参考")
    sheet = Path(profile["reference"])
    images = [sheet.parent / name for name in ("ip_face_wide.png", "ip_sticker.png")]
    calibration = sheet.parent / "mouth.json"
    if not all(p.is_file() for p in [*images, calibration]):
        raise ValueError("请按 SKILL.md 准备头肩像、立绘和 mouth.json")
    mouth = json.loads(calibration.read_text(encoding="utf-8"))
    if mouth is not None and not (0 <= mouth["x"] <= 1 and 0 <= mouth["y"] <= 1 and mouth["s"] > 0):
        raise ValueError("请核对嘴部中心和缩放")
    if not (project / "index.html").is_file():
        raise ValueError("请选择从模板复制出的工程目录")
    assets = project / "assets"
    for p in [sheet, *images]:
        shutil.copyfile(p, assets / p.name)
    brand = {"name": profile["name"], "mouth": mouth, "outro": profile.get("outro", "")}
    (project / "brand.js").write_text("window.BRAND = " + json.dumps(brand, ensure_ascii=False) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    setup = sub.add_parser("set")
    setup.add_argument("name")
    setup.add_argument("sheet", type=Path)
    prepare = sub.add_parser("apply")
    prepare.add_argument("project", type=Path)
    args = parser.parse_args()
    if args.command == "set":
        print(json.dumps(save(args.name, args.sheet.expanduser()), ensure_ascii=False))
    elif args.command == "status":
        print(json.dumps(read(), ensure_ascii=False))
    else:
        apply(read(), args.project)
