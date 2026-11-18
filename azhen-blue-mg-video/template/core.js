/* 蓝色动效库 · 公共底层（AK）
   所有模板都是 t（秒）或 p（0–1）的纯函数：不读时钟、不用未固定种子的随机数，seek 到任意时刻画面一致。
   世界坐标 = 竖版设计稿 1080×1920；2K 导出由调用方 setTransform 整体放大。
   风格：浅色质感档（样片 v2）——平涂浅底、墨黑粗体、主蓝强调、点缀色只做小件；无投影、无渐变、无纹理。 */
(function () {
  "use strict";
  const W = 1080, H = 1920, ML = 110, MR = 970;
  // 版式 / 图表的画区：大标题在上（由外层画），模板只画这块
  const REGION = { x: 110, y: 600, w: 860, h: 740 };   // 旧版画区（全蓝版模板用）
  // 新版：标题固定在顶部（文楷，小一号，可不要）；中间是整块舞台，可出血到左右边，镜头只动舞台；字幕和头像固定在底部
  // 左右留 110 边距（和标题、字幕左边对齐），内容和图片都不出血
  // 内容区按设计系统：x 110–970，y 240–1300；1300 以下留给字幕和头像
  const STAGE = { x: ML, y: 470, w: MR - ML, h: 830 };        // 有标题时：y 470–1300
  const STAGE_FULL = { x: ML, y: 240, w: MR - ML, h: 1060 };  // 不要标题时：y 240–1300
  const C = {
    bg: "#F3EFE6", ink: "#1C1A20", sec: "#55524D", muted: "#6E6A64", line: "#E2DFD8", white: "#FFFFFF", field: "#F3F1EC", bub: "#EFEDE8",
    acc: "#2463D4", accTint: "#E8F1FF", accMid: "#84B8FF", accTxt: "#174FAF",
    // 点缀色色板：蓝 / 青 / 绿 / 琥珀 / 粉；coral = 粉，rose = 青（名字沿用，方便旧模板）
    amber: "#F6C06C", green: "#7EBA72", coral: "#FC9CA8", blue: "#66A2FC", rose: "#60CCDE",
    // 三档：Tint 浅底（标签 / 小块底，参考色 16% 叠在白上）、本色（实心小块 + 白图标、柱、点、细条、描边）、Deep 压暗（浅底上的字和细线）
    amberTint: "#FEF5E7", greenTint: "#EAF4E8", coralTint: "#FFEFF1", blueTint: "#E7F0FF", roseTint: "#E6F7FA",
    amberDeep: "#A56E17", greenDeep: "#436E3A", coralDeep: "#C2577A", blueDeep: "#2A62B6", roseDeep: "#287480",
    dark: "#141414", darkCard: "#1F1E1C", darkLine: "#3A3835", darkMuted: "#BDB9B1",
  };
  // 数据系列配色（图表用，按顺序取）：主蓝打头，其余点缀
  const SERIES = [C.acc, C.blue, C.coral, C.amber, C.green, C.accMid, C.rose, "#B8B3AA"];

  // ── 缓动与插值 ──
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, t0, d) => cl((t - t0) / (d || 1e-6));
  const EASE = x => 1 - Math.pow(1 - cl(x), 3);
  const EASE5 = x => 1 - Math.pow(1 - cl(x), 5);
  const EASE_IN = x => Math.pow(cl(x), 3);
  const EASE_IO = x => { x = cl(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const BACK = (x, k = 1.7) => { x = cl(x); const c3 = k + 1; return 1 + c3 * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); };
  const spring = (t, f = 2.0, z = 6) => t <= 0 ? 0 : 1 - Math.exp(-z * t) * Math.cos(f * Math.PI * 2 * t);
  const pop = (t, t0) => { const k = spring(t - t0); return k <= 0 ? 0 : (k > 1 ? 1 + (k - 1) * .45 : k); };
  // 分段插值，段内 EASE_IO：keys = [[t, v], ...]
  function pwl(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return lerp(v0, v1, EASE_IO((t - t0) / (t1 - t0 || 1))); }
    return keys[keys.length - 1][1];
  }
  // 固定种子的伪随机（seek 安全）
  const rand = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const mix = (a, b, k) => { const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const A = h(a), B = h(b); return "rgb(" + A.map((v, i) => Math.round(lerp(v, B[i], cl(k)))).join(",") + ")"; };
  const alpha = (hex, a) => { const h = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return `rgba(${h[0]},${h[1]},${h[2]},${a})`; };

  // ── 画布与基础绘图（ctx 由外层设置到 AK.ctx）──
  // 按语义取色：AK.TONE.green.tint / .mid / .deep；ACCENTS 用于一组并列元素轮流取色
  const TONE = {};
  ["acc", "amber", "green", "coral", "blue", "rose"].forEach(k => TONE[k] = k === "acc" ? { tint: C.accTint, mid: C.acc, deep: C.accTxt } : { tint: C[k + "Tint"], mid: C[k], deep: C[k + "Deep"] });
  const ACCENTS = ["blue", "coral", "amber", "green", "rose"];
  const AK = { TONE, ACCENTS, W, H, ML, MR, REGION, STAGE, STAGE_FULL, C, SERIES, cl, lerp, prog, EASE, EASE5, EASE_IN, EASE_IO, BACK, spring, pop, pwl, rand, mix, alpha, IMG: {}, defs: {} };
  const X = () => AK.ctx;
  AK.font = (s, w = 500) => `${w} ${s}px MiSans, "PingFang SC", sans-serif`;
  AK.numFont = (s, w = 600) => `italic ${w} ${s}px Fraunces, Georgia, serif`;   // 只用于数字
  AK.rr = (x, y, w, h, r) => { const c = X(); r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  AK.fillRR = (x, y, w, h, r, col) => { AK.rr(x, y, w, h, r); X().fillStyle = col; X().fill(); };
  AK.strokeRR = (x, y, w, h, r, col, lw = 2) => { AK.rr(x, y, w, h, r); X().strokeStyle = col; X().lineWidth = lw; X().stroke(); };
  // 文字：基线居中；返回宽度。weight 500/600/700/900
  AK.text = (s, x, y, size, col = C.ink, w = 500, align = "left") => { const c = X(); c.font = AK.font(size, w); c.fillStyle = col; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, x, y); return c.measureText(s).width; };
  AK.num = (s, x, y, size, col = C.ink, align = "left", w = 600) => { const c = X(); c.font = AK.numFont(size, w); c.fillStyle = col; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, x, y); return c.measureText(s).width; };
  AK.measure = (s, size, w = 500) => { X().font = AK.font(size, w); return X().measureText(s).width; };
  AK.measureNum = (s, size, w = 600) => { X().font = AK.numFont(size, w); return X().measureText(s).width; };
  // 富文本：{} 内为主蓝
  AK.rich = (s, x, y, size, w = 700, col = C.ink, hi = C.acc) => { let hiOn = false; for (const seg of s.split(/([{}])/)) { if (seg === "{") { hiOn = true; continue; } if (seg === "}") { hiOn = false; continue; } x += AK.text(seg, x, y, size, hiOn ? hi : col, w); } return x; };
  AK.richW = (s, size, w = 700) => s.split(/[{}]/).reduce((a, seg) => a + AK.measure(seg, size, w), 0);
  AK.withA = (a, fn) => { if (a <= 0) return; const c = X(); c.save(); c.globalAlpha *= Math.min(1, a); fn(); c.restore(); };
  AK.about = (cx, cy, s, sy) => { const c = X(); c.translate(cx, cy); c.scale(s, sy == null ? s : sy); c.translate(-cx, -cy); };
  AK.dot = (x, y, r, col) => { const c = X(); c.fillStyle = col; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, 6.2832); c.fill(); };
  AK.ring = (x, y, r, col, lw = 3) => { const c = X(); c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, 6.2832); c.stroke(); };
  AK.line = (x1, y1, x2, y2, col, lw = 3, dash) => { const c = X(); c.save(); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = "round"; if (dash) c.setLineDash(dash); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore(); };
  AK.emoji = (ch, x, y, size, a = 1) => { if (a <= 0 || size <= 0) return; const c = X(); c.save(); c.globalAlpha *= a; c.font = `${size}px "Apple Color Emoji", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(ch, x, y + size * .06); c.restore(); };
  // 图片：完整显示（contain），圆角，可选描边；不裁切
  AK.image = (key, x, y, w, h, o = {}) => {
    const img = AK.IMG[key], c = X(); if (!img || !img.width) return { x, y, w, h };
    const s = Math.min(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s, ix = x + (w - iw) / 2, iy = y + (h - ih) / 2, r = o.r == null ? 18 : o.r;
    c.save(); AK.rr(ix, iy, iw, ih, r); c.clip(); c.drawImage(img, ix, iy, iw, ih); c.restore();
    if (o.stroke !== false) AK.strokeRR(ix, iy, iw, ih, r, o.stroke || C.line, o.lw || 2);
    return { x: ix, y: iy, w: iw, h: ih };
  };
  // 对勾：两笔写成，k 为书写进度
  AK.check = (x, y, s, col, k = 1, lw = 4) => { if (k <= 0) return; const c = X(); c.save(); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
    const p = [[x - s * .45, y], [x - s * .12, y + s * .32], [x + s * .5, y - s * .38]], k1 = cl(k * 2), k2 = cl(k * 2 - 1);
    c.moveTo(p[0][0], p[0][1]); c.lineTo(lerp(p[0][0], p[1][0], k1), lerp(p[0][1], p[1][1], k1)); if (k2 > 0) c.lineTo(lerp(p[1][0], p[2][0], k2), lerp(p[1][1], p[2][1], k2)); c.stroke(); c.restore(); };
  // 点 → 勾：琥珀小点长大变绿，画出对勾
  AK.dotCheck = (t, x, y, t0, r1 = 20) => { const e = EASE(prog(t, t0, .32)); AK.dot(x, y, lerp(10, r1, e), e > 0 ? mix(C.amber, C.green, e) : C.amber); AK.check(x, y + 1, r1, C.ink, (e - .1) / .9, 4); };
  // 卡片：白底 + 发丝线（无投影）；dark=true 为墨黑卡
  AK.card = (x, y, w, h, o = {}) => { AK.fillRR(x, y, w, h, o.r == null ? 44 : o.r, o.dark ? C.ink : (o.fill || C.white)); if (!o.dark && o.stroke !== false) AK.strokeRR(x, y, w, h, o.r == null ? 44 : o.r, o.stroke || C.line, 2); };
  // 胶囊标签：kind = "acc"（浅蓝底蓝字）| "solid"（蓝底白字）| "line"（白底描边）| "dark"
  AK.pill = (s, x, y, size = 30, kind = "acc", o = {}) => {
    const w = AK.measure(s, size, 700) + (o.pad || size * 1.2) + (o.dotCol ? size * .8 : 0), h = size * 1.75;
    const bg = { acc: C.accTint, solid: C.acc, line: C.white, dark: C.ink }[kind], fg = { acc: C.accTxt, solid: C.white, line: C.ink, dark: C.white }[kind];
    AK.fillRR(x, y - h / 2, w, h, h / 2, bg); if (kind === "line") AK.strokeRR(x, y - h / 2, w, h, h / 2, o.stroke || C.line, 2);
    let tx = x + (o.pad || size * 1.2) / 2; if (o.dotCol) { AK.dot(tx + size * .25, y, size * .22, o.dotCol); tx += size * .8; }
    AK.text(s, tx, y + 1, size, fg, 700); return w;
  };
  AK.pillW = (s, size = 30, o = {}) => AK.measure(s, size, 700) + (o.pad || size * 1.2) + (o.dotCol ? size * .8 : 0);

  // ── 线条图标（24 网格，round 线帽，线宽随尺寸）：AK.icon(name, cx, cy, size, col) ──
  const ICONS = {
    search: c => { c.arc(10.5, 10.5, 6.5, 0, 6.2832); c.moveTo(15.5, 15.5); c.lineTo(20, 20); },
    image: c => { AK.rrPath(c, 3, 4, 18, 16, 3); c.moveTo(3, 16); c.lineTo(9, 11); c.lineTo(14, 15.5); c.lineTo(17, 13); c.lineTo(21, 16.5); c.moveTo(16.5, 8.5); c.arc(15.5, 8.5, 1, 0, 6.2832); },
    video: c => { AK.rrPath(c, 3, 6, 13, 12, 3); c.moveTo(16, 10.5); c.lineTo(21, 7.5); c.lineTo(21, 16.5); c.lineTo(16, 13.5); },
    play: c => { c.moveTo(8, 5.5); c.lineTo(18.5, 12); c.lineTo(8, 18.5); c.closePath(); },
    mic: c => { AK.rrPath(c, 9, 3, 6, 11, 3); c.moveTo(5.5, 11); c.arc(12, 11, 6.5, Math.PI, 0, true); c.moveTo(12, 17.5); c.lineTo(12, 21); },
    doc: c => { c.moveTo(6, 3); c.lineTo(14, 3); c.lineTo(19, 8); c.lineTo(19, 21); c.lineTo(6, 21); c.closePath(); c.moveTo(14, 3); c.lineTo(14, 8); c.lineTo(19, 8); c.moveTo(9, 13); c.lineTo(16, 13); c.moveTo(9, 17); c.lineTo(14, 17); },
    folder: c => { c.moveTo(3, 7); c.lineTo(9, 7); c.lineTo(11, 9); c.lineTo(21, 9); c.lineTo(21, 19); c.lineTo(3, 19); c.closePath(); },
    sparkle: c => { c.moveTo(12, 3); c.quadraticCurveTo(13, 11, 21, 12); c.quadraticCurveTo(13, 13, 12, 21); c.quadraticCurveTo(11, 13, 3, 12); c.quadraticCurveTo(11, 11, 12, 3); },
    heart: c => { c.moveTo(12, 20); c.bezierCurveTo(3, 14, 3, 6, 8, 5.5); c.bezierCurveTo(10, 5.3, 11.5, 6.5, 12, 8); c.bezierCurveTo(12.5, 6.5, 14, 5.3, 16, 5.5); c.bezierCurveTo(21, 6, 21, 14, 12, 20); },
    star: c => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 9, a = -Math.PI / 2 + i * Math.PI / 5; (i ? c.lineTo : c.moveTo).call(c, 12 + r * Math.cos(a), 12.5 + r * Math.sin(a)); } c.closePath(); },
    bell: c => { c.moveTo(6, 16); c.lineTo(6, 11); c.bezierCurveTo(6, 7, 8.5, 5, 12, 5); c.bezierCurveTo(15.5, 5, 18, 7, 18, 11); c.lineTo(18, 16); c.lineTo(19.5, 18); c.lineTo(4.5, 18); c.closePath(); c.moveTo(10, 20.5); c.lineTo(14, 20.5); },
    gear: c => { c.arc(12, 12, 3, 0, 6.2832); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.moveTo(12 + 6 * Math.cos(a), 12 + 6 * Math.sin(a)); c.lineTo(12 + 8.5 * Math.cos(a), 12 + 8.5 * Math.sin(a)); } c.moveTo(18, 12); c.arc(12, 12, 6, 0, 6.2832); },
    calendar: c => { AK.rrPath(c, 3, 5, 18, 16, 3); c.moveTo(3, 10); c.lineTo(21, 10); c.moveTo(8, 3); c.lineTo(8, 7); c.moveTo(16, 3); c.lineTo(16, 7); },
    user: c => { c.arc(12, 8, 4, 0, 6.2832); c.moveTo(4.5, 20.5); c.bezierCurveTo(5, 15.5, 8, 14, 12, 14); c.bezierCurveTo(16, 14, 19, 15.5, 19.5, 20.5); },
    chat: c => { AK.rrPath(c, 3, 4, 18, 13, 4); c.moveTo(8, 17); c.lineTo(7, 21); c.lineTo(12, 17); },
    link: c => { c.moveTo(10, 14); c.lineTo(14, 10); c.moveTo(8.5, 11.5); c.lineTo(6.5, 13.5); c.arc(8.75, 15.25, 3, 2.36, 5.5, false); c.moveTo(15.5, 12.5); c.lineTo(17.5, 10.5); c.arc(15.25, 8.75, 3, -0.78, 2.36, false); },
    clock: c => { c.arc(12, 12, 9, 0, 6.2832); c.moveTo(12, 7); c.lineTo(12, 12); c.lineTo(15.5, 14); },
    send: c => { c.moveTo(12, 19); c.lineTo(12, 5); c.moveTo(6.5, 10.5); c.lineTo(12, 5); c.lineTo(17.5, 10.5); },
    plus: c => { c.moveTo(12, 5); c.lineTo(12, 19); c.moveTo(5, 12); c.lineTo(19, 12); },
    close: c => { c.moveTo(6, 6); c.lineTo(18, 18); c.moveTo(18, 6); c.lineTo(6, 18); },
    chevron: c => { c.moveTo(9, 6); c.lineTo(15, 12); c.lineTo(9, 18); },
    download: c => { c.moveTo(12, 4); c.lineTo(12, 15); c.moveTo(7, 10.5); c.lineTo(12, 15.5); c.lineTo(17, 10.5); c.moveTo(5, 20); c.lineTo(19, 20); },
    layers: c => { c.moveTo(12, 3.5); c.lineTo(21, 8.5); c.lineTo(12, 13.5); c.lineTo(3, 8.5); c.closePath(); c.moveTo(3, 12.5); c.lineTo(12, 17.5); c.lineTo(21, 12.5); c.moveTo(3, 16.5); c.lineTo(12, 21.5); c.lineTo(21, 16.5); },
    pin: c => { c.moveTo(12, 21); c.bezierCurveTo(6, 14.5, 5, 12, 5, 9.5); c.bezierCurveTo(5, 5.5, 8, 3, 12, 3); c.bezierCurveTo(16, 3, 19, 5.5, 19, 9.5); c.bezierCurveTo(19, 12, 18, 14.5, 12, 21); c.moveTo(14.5, 9.5); c.arc(12, 9.5, 2.5, 0, 6.2832); },
    cursor: c => { c.moveTo(6, 3.5); c.lineTo(6, 19); c.lineTo(10, 15); c.lineTo(13, 21); c.lineTo(15.5, 20); c.lineTo(12.5, 14); c.lineTo(18, 14); c.closePath(); },
    edit: c => { c.moveTo(4, 20); c.lineTo(5, 15.5); c.lineTo(16, 4.5); c.lineTo(19.5, 8); c.lineTo(8.5, 19); c.closePath(); },
    trash: c => { c.moveTo(4.5, 6.5); c.lineTo(19.5, 6.5); c.moveTo(9, 6.5); c.lineTo(9.5, 3.5); c.lineTo(14.5, 3.5); c.lineTo(15, 6.5); c.moveTo(6.5, 6.5); c.lineTo(7.5, 20.5); c.lineTo(16.5, 20.5); c.lineTo(17.5, 6.5); },
    grid: c => { AK.rrPath(c, 3.5, 3.5, 7, 7, 2); AK.rrPath(c, 13.5, 3.5, 7, 7, 2); AK.rrPath(c, 3.5, 13.5, 7, 7, 2); AK.rrPath(c, 13.5, 13.5, 7, 7, 2); },
    bolt: c => { c.moveTo(13.5, 2.5); c.lineTo(5, 13.5); c.lineTo(11.5, 13.5); c.lineTo(10.5, 21.5); c.lineTo(19, 10.5); c.lineTo(12.5, 10.5); c.closePath(); },
    eye: c => { c.moveTo(2.5, 12); c.bezierCurveTo(5.5, 6.5, 18.5, 6.5, 21.5, 12); c.bezierCurveTo(18.5, 17.5, 5.5, 17.5, 2.5, 12); c.moveTo(15, 12); c.arc(12, 12, 3, 0, 6.2832); },
    home: c => { c.moveTo(3.5, 11); c.lineTo(12, 4); c.lineTo(20.5, 11); c.moveTo(6, 9.5); c.lineTo(6, 20); c.lineTo(18, 20); c.lineTo(18, 9.5); },
    music: c => { c.moveTo(9, 17.5); c.lineTo(9, 5); c.lineTo(19, 3.5); c.lineTo(19, 15.5); c.moveTo(9, 17.5); c.arc(6.5, 17.5, 2.5, 0, 6.2832); c.moveTo(19, 15.5); c.arc(16.5, 15.5, 2.5, 0, 6.2832); },
    filter: c => { c.moveTo(3.5, 5); c.lineTo(20.5, 5); c.lineTo(14, 12.5); c.lineTo(14, 19.5); c.lineTo(10, 17.5); c.lineTo(10, 12.5); c.closePath(); },
    chart: c => { c.moveTo(4, 4); c.lineTo(4, 20); c.lineTo(20, 20); c.moveTo(8, 16); c.lineTo(8, 12); c.moveTo(12, 16); c.lineTo(12, 8); c.moveTo(16, 16); c.lineTo(16, 11); },
  };
  AK.rrPath = (c, x, y, w, h, r) => { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  AK.ICON_NAMES = Object.keys(ICONS);
  AK.icon = (name, cx, cy, size, col = C.ink, o = {}) => {
    const f = ICONS[name]; if (!f) return; const c = X(), s = size / 24;
    c.save(); c.translate(cx - size / 2, cy - size / 2); c.scale(s, s); c.beginPath(); f(c);
    if (o.fill) { c.fillStyle = col; c.fill(); } else { c.strokeStyle = col; c.lineWidth = (o.lw || 2) ; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(); }
    c.restore();
  };
  // 图标方块：圆角方块 + 白色线条图标（App 图标感）
  AK.iconTile = (name, x, y, s, bg = C.acc, fg = C.white) => { AK.fillRR(x, y, s, s, s * .27, bg); AK.icon(name, x + s / 2, y + s / 2, s * .56, fg, { lw: 2.2 }); };

  // ── 交互道具 ──
  // 手指（触点）+ 蓝色点击环：keys=[[t,x,y],...]，tapT 点按时刻
  AK.finger = (t, o) => { const c = X(), a = EASE(prog(t, o.in == null ? 0 : o.in, .2)) * (1 - EASE(prog(t, o.out == null ? 1e9 : o.out, .2))); if (a <= 0) return;
    const x = pwl(t, o.keys.map(k => [k[0], k[1]])), y = pwl(t, o.keys.map(k => [k[0], k[2]])), sq = 1 - .2 * Math.sin(Math.PI * prog(t, o.tapT == null ? 1e9 : o.tapT, .2));
    c.save(); c.globalAlpha *= a; c.translate(x, y); c.scale(sq, sq); c.fillStyle = "rgba(20,20,20,.12)"; c.beginPath(); c.arc(0, 0, 40, 0, 6.2832); c.fill();
    c.strokeStyle = "rgba(20,20,20,.34)"; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 40, 0, 6.2832); c.stroke(); c.restore();
    const rp = prog(t, o.tapT == null ? 1e9 : o.tapT, .45), ring = o.ringAt || { x, y }; if (rp > 0 && rp < 1) AK.withA((1 - rp) * .7, () => AK.ring(ring.x, ring.y, 50 + 80 * EASE(rp), C.acc, 3)); };
  // 鼠标光标（桌面场景）
  AK.cursor = (t, keys, tapT, col = C.ink) => { const x = pwl(t, keys.map(k => [k[0], k[1]])), y = pwl(t, keys.map(k => [k[0], k[2]])), s = 1 - .15 * Math.sin(Math.PI * prog(t, tapT == null ? 1e9 : tapT, .2));
    const c = X(); c.save(); c.translate(x, y); c.scale(s * 2.2, s * 2.2); c.beginPath(); ICONS.cursor(c); c.fillStyle = C.white; c.fill(); c.strokeStyle = col; c.lineWidth = 1.6; c.lineJoin = "round"; c.stroke(); c.restore();
    const rp = prog(t, tapT == null ? 1e9 : tapT, .45); if (rp > 0 && rp < 1) AK.withA((1 - rp) * .7, () => AK.ring(x + 6, y + 6, 24 + 50 * EASE(rp), C.acc, 3)); };
  // 2D 虚拟相机：keys = [[t, s, cx, cy]]，世界点 (cx,cy) 落在画面中心
  AK.cameraBegin = (t, keys) => { const s = pwl(t, keys.map(k => [k[0], k[1]])), cx = pwl(t, keys.map(k => [k[0], k[2]])), cy = pwl(t, keys.map(k => [k[0], k[3]])), c = X(); c.save(); c.translate(540, 960); c.scale(s, s); c.translate(-cx, -cy); return { s, cx, cy }; };
  AK.cameraEnd = () => X().restore();

  // ── 外层：大标题、字幕胶囊、头像（版式 / 图表 demo 用；正式视频由场景自己调）──
  // 霞鹜文楷：标题和有温度的短句用；数字仍用 Fraunces，正文和标签用 MiSans
  AK.kaiFont = (s, w = 500) => `${w} ${s}px "LXGW WenKai", MiSans, serif`;
  AK.kai = (s, x, y, size, col = C.ink, w = 500, align = "left") => { const c = X(); c.font = AK.kaiFont(size, w); c.fillStyle = col; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, x, y); return c.measureText(s).width; };
  AK.kaiW = (s, size, w = 500) => { X().font = AK.kaiFont(size, w); return X().measureText(s.replace(/[{}]/g, "")).width; };
  AK.kaiRich = (s, x, y, size, w = 500, col = C.ink, hi = C.acc) => { let on = false; for (const seg of s.split(/([{}])/)) { if (seg === "{") { on = true; continue; } if (seg === "}") { on = false; continue; } x += AK.kai(seg, x, y, size, on ? hi : col, w); } return x; };
  // 新版标题：固定在左上，文楷 84px，两行；o.size 可在 64–96 之间微调
  AK.headline = (t, l1, l2, o = {}) => { const size = o.size || 84, y1 = o.y1 || 290, lh = o.lh || size * 1.22, t0 = o.t0 || 0;
    [l1, l2].forEach((s, i) => { if (!s) return; const k = EASE(prog(t, t0 + i * .1, .45)); AK.withA(k, () => { const c = X(); c.save(); c.translate(0, (1 - k) * 36); AK.kaiRich(s, ML, y1 + i * lh, size, 500); c.restore(); }); }); };
  // 舞台：裁到舞台范围，再套镜头。keys = [[t, 倍率, 看向x, 看向y, 倾斜度数?], ...]，倍率 ≤ 1.5；看向点会放到舞台中心
  AK.stage = (t, keys, fn, full = false) => { const c = X(), S = full ? STAGE_FULL : STAGE; c.save(); c.beginPath(); c.rect(S.x, S.y, S.w, S.h); c.clip();
    if (keys && keys.length) { const s = pwl(t, keys.map(k => [k[0], k[1]])), cx = pwl(t, keys.map(k => [k[0], k[2]])), cy = pwl(t, keys.map(k => [k[0], k[3]])), r = pwl(t, keys.map(k => [k[0], k[4] || 0]));
      c.translate(S.x + S.w / 2, S.y + S.h / 2); c.rotate(r * Math.PI / 180); c.scale(s, s); c.translate(-cx, -cy); }
    fn(S); c.restore(); };
  AK.title = (t, l1, l2, o = {}) => { const size = o.size || 96, y1 = o.y1 || 380, y2 = o.y2 || 492, t0 = o.t0 || 0;   // 主标题 140 → 96，黑体（MiSans Heavy）
    [l1, l2].forEach((s, i) => { if (!s) return; const k = EASE(prog(t, t0 + i * .1, .4)); AK.withA(k, () => { const c = X(); c.save(); c.translate(0, (1 - k) * 36); AK.rich(s, ML, i ? y2 : y1, size, 900); c.restore(); }); }); };
  AK.caption = (t, s, t0 = .2, t1 = 1e9) => { const a = Math.min(EASE(prog(t, t0, .2)), 1 - prog(t, t1 - .15, .15)); if (a <= 0 || !s) return;
    let size = 44; while (AK.measure(s, size, 700) + 60 > 620 && size > 34) size--; const w = AK.measure(s, size, 700) + 60;
    AK.withA(a, () => { const c = X(); c.save(); c.translate(0, (1 - a) * 12); AK.fillRR(ML, 1514, w, 80, 40, C.ink); AK.text(s, ML + 30, 1555, size, C.white, 700); c.restore(); }); };
  AK.avatar = (t, tin = .1) => { const k = spring(t - tin); if (k <= 0 || !AK.IMG.face) return; const c = X(), r = 130;
    c.save(); c.globalAlpha *= cl(k * 2); c.translate(880, 1540); c.scale(lerp(.6, 1, cl(k)), lerp(.6, 1, cl(k)));
    c.save(); c.beginPath(); c.arc(0, 0, r, 0, 6.2832); c.clip(); c.fillStyle = "#E2EDFF"; c.fillRect(-r, -r, 2 * r, 2 * r); c.drawImage(AK.IMG.face, -r, -r, 2 * r, 2 * r); c.restore();
    AK.ring(0, 0, r + 1, C.white, 2); AK.ring(0, 0, r - 3, C.acc, 6); c.restore(); };

  // ── 注册：AK.register("T010", { kind, name, en, group, dur, demo, draw }) ──
  // transition: draw(ctx, p, A, B, o)  p∈[0,1]；A(ctx)/B(ctx) 各画一整页（含底色），模板负责怎么从 A 过渡到 B
  // layout / chart: draw(ctx, t, o)  t∈[0,dur]；只画 REGION 里的主体（大标题、字幕、头像由外层画）；o 缺省时用 demo 内容
  AK.register = (code, def) => { def.code = code; AK.defs[code] = def; };

  window.AK = AK;
})();
