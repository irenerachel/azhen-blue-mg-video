#!/bin/zsh
# 渲一个版本的 2K 50 fps；用 nohup 启动，会话中断也继续跑。用法: run_one.sh <输出文件名> [light]
# 横版：LAYOUT=h tools/run_one.sh <输出文件名>（环境变量会传给 render.py）
cd "${0:A:h}/.."
rm -f render_one.done
rm -rf build
echo "start $1 $(date +%T)"
FPS=50 SCALE=1.3333333 THEME=${2:-} python3 tools/render.py . video "$1.part.mp4" 6 && mv "$1.part.mp4" "$1" || { echo "FAIL"; exit 1; }
echo "done $1 $(date +%T)"
touch render_one.done
