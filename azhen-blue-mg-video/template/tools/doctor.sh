#!/bin/zsh
# 开工前检查环境：渲染（python3 + playwright + Chrome）、ffmpeg、时间轴和混音用的 Python 环境
# 用法：tools/doctor.sh            输出每一项是否就绪；缺 whisper 环境时打印一行安装命令
ok() { print "✓ $1" } ; bad() { print "✗ $1"; FAIL=1 }
FAIL=0
command -v ffmpeg >/dev/null && ok "ffmpeg" || bad "ffmpeg（brew install ffmpeg）"
command -v ffprobe >/dev/null && ok "ffprobe" || bad "ffprobe"
python3 -c "import playwright" 2>/dev/null && ok "python3 + playwright" || bad "playwright（python3 -m pip install playwright）"
[ -d "/Applications/Google Chrome.app" ] && ok "Chrome" || bad "Chrome（渲染用 channel=chrome）"
# whisper / 混音环境：优先 PY 环境变量，其次 ~/.venvs/blue-mg
PY=${PY:-$HOME/.venvs/blue-mg/bin/python}
if [ -x "$PY" ] && "$PY" -c "import faster_whisper, jieba, numpy, soundfile, scipy, PIL" 2>/dev/null; then
  ok "时间轴 / 混音环境：$PY"
else
  bad "时间轴 / 混音环境（faster-whisper jieba numpy soundfile scipy pillow）"
  print "  安装：uv venv -p 3.11 ~/.venvs/blue-mg && uv pip install -p ~/.venvs/blue-mg/bin/python faster-whisper jieba numpy soundfile scipy pillow"
  print "  之后的命令用 PY=~/.venvs/blue-mg/bin/python"
fi
ls ~/.cache/huggingface/hub 2>/dev/null | grep -q faster-whisper-small && ok "whisper small 模型已缓存" || print "· whisper small 模型第一次运行时会自动下载"
[ $FAIL = 0 ] && print "环境就绪" || print "有缺项，先补上再开工"
