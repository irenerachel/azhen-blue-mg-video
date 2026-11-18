#!/bin/zsh
# 按 audio/cues.json 混音，再轻压缩并归一到 −14 LUFS。用法：tools/finish_audio.sh（在工程目录运行）
set -e
PY=${PY:-python3}
$PY tools/mix.py audio
ffmpeg -loglevel error -y -i audio/mix_raw.wav -af "acompressor=threshold=-18dB:ratio=2.5:attack=8:release=120,loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 audio/mix.wav
ffmpeg -i audio/mix.wav -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2
