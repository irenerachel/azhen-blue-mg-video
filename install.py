"""安装蓝色 MG 视频 Skill，并在终端完成首次设置。"""
import os
import runpy
import shutil
import sys
from pathlib import Path

source = Path(__file__).resolve().parent / "azhen-blue-mg-video"
dest = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex") / "skills" / source.name
if dest.exists():
    print("此名称的 Skill 已安装，保留现有文件。")
else:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, dest)
    print("已安装到", dest)
profile = runpy.run_path(str(dest / "scripts/profile.py"))
if not profile["read"]():
    if sys.stdin.isatty():
        name = input("以后怎么称呼你？ ").strip()
        while True:
            answer = input("请提供你的 IP 三视图（正面、侧面、背面）的图片路径，或回车留到对话中上传：").strip()
            if not answer:
                break
            try:
                if not name:
                    name = input("请输入希望使用的称呼：").strip()
                profile["save"](name, Path(answer.strip('"').strip("'")).expanduser())
                print("设置已保存。")
                break
            except (OSError, ValueError) as error:
                print(error)
    else:
        print("请在当前对话中询问接收者希望使用的称呼，并请对方上传自己的 IP 三视图。")
