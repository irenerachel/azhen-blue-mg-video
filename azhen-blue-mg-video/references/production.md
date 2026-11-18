# 制作流程

在从模板复制的工程中运行命令。渲染需要 Python 3、Playwright、Chrome、FFmpeg 和 ffprobe；音频环境需安装 faster-whisper、jieba、numpy、soundfile、scipy、pillow。macOS 可用 `zsh tools/doctor.sh` 自检。首次运行 Whisper 需取得 small 模型。渲染脚本用当前 python3，以下 PY 指音频环境的解释器。

## 口播与插图

1. 在 script.json 中按顺序逐句写 key、say，以及 marks（名称映射到本句中可定位的子串）。最后一屏 key 用 end。alt 为 true 时切到深底，extra 可增加句后停留，noflip 可关闭切屏音效。不能拆开的词写入 keep.json。用 `python3 tools/estimate.py script.json 80` 估计时长，示例中的 80 是期望片长，按本片目标替换。
2. 配音使用接收者可用的音色。可用 LibTV 逐句生成并下载为 audio/libtv_raw/00_key.mp3 等，或使用接收者提供的录音转成同格式。脚本姓名、多音字单独听验，必要时只修配音输入。核对选中音色后批量合成。
3. 用工程里的 IP 三视图制作本片需要的插图。使用 LibTV 时上传到接收者自己的项目，记录图片节点，以参考节点连接生图任务。支持时设置透明背景，下载后用 crop_alpha.py 裁边。其他图像工具沿用同一参考。插图提示词：

```text
参考所附角色三视图。保持角色原有的身形比例、轮廓、五官、服装、材质和配件。让角色完成【动作】，与【道具】互动，视线指向【目标】。道具用蓝色作为视觉重点。主体完整，透明背景，画面无文字。
```

## 同步声音与画面

```sh
PY="${PY:-python3}"
"$PY" tools/libtv_voice.py script.json audio/libtv_raw audio/voice
"$PY" tools/build_cues.py .
PY="$PY" zsh tools/finish_audio.sh
"$PY" tools/make_mouth.py .
```

核对听写、停顿和分词。改完口播后重新生成 cues.js、audio/cues.json、mix.wav 和 mouth.js。背景音乐可选，放在 audio/bgm.mp3，默认低于口播约 22 dB，BGM_DB 可调整。

在 index.html 的场景段按 script.json 的 key 编写 SCENES，调整对应的 TRANS。把新插图加进 IMGS。使用 LY.box 同时适配横竖画幅，标题用 TT。每一屏抽入场后、口播标记处及转场前三帧，检查动作与解说的因果关系。

```sh
python3 tools/render.py . frames 1 2 5
python3 tools/render.py . preview 预览.mp4 4
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 预览.mp4
"$PY" tools/ppt_check.py 预览.mp4
```

首次交付取开头 15 秒。短片按实际时长输出。按 ffprobe 的结果标注时长。先制作样片覆盖的场景及截点处正在进入的转场，确认后继续余下场景，并导出完整成片。

```sh
MB=4 zsh tools/run_one.sh 片名_竖版_黑体版_2K50.mp4
```

模板自带的 8 秒时间轴用于检查画面；制作新片时 build_cues.py 会生成本片时间轴。

横版加 LAYOUT=h，文楷加 FONT=kai。正式片用 ffprobe 核对 1440×2560 或 2560×1440、50fps 和音轨。用本次实际片长选择抽帧时间。逐版渲染并保留已交付的旧版。
