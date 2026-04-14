// ============================================================
//  title.js — タイトル画面アニメーション
//  星空・城シルエット・紋章をcanvasで描画
// ============================================================

const TitleScreen = (() => {

  let _animId   = null;
  let _bgCanvas = null;
  let _bgCtx    = null;
  let _stars    = [];
  let _t        = 0;

  // ── 初期化 ────────────────────────────────────────────────
  function init() {
    const bg = document.getElementById('title-bg-canvas');
    const em = document.getElementById('title-emblem-canvas');
    if (!bg) return;

    _bgCanvas = bg;
    _bgCtx    = bg.getContext('2d');
    _initStars();
    if (em) _drawEmblem(em);
    _animate();
  }

  function stop() {
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
  }

  // ── 星の初期化 ────────────────────────────────────────────
  function _initStars() {
    _stars = Array.from({ length: 140 }, () => ({
      x     : Math.random(),
      y     : Math.random() * 0.78,
      r     : Math.random() * 1.6 + 0.3,
      phase : Math.random() * Math.PI * 2,
      speed : 0.006 + Math.random() * 0.018,
      warm  : Math.random() < 0.2, // 暖色星（黄色っぽい）
    }));
  }

  // ── アニメーションループ ──────────────────────────────────
  function _animate() {
    _t += 0.016;
    const bg = _bgCanvas;

    // canvas サイズをディスプレイに合わせる
    if (bg.width  !== bg.clientWidth  && bg.clientWidth  > 0) bg.width  = bg.clientWidth;
    if (bg.height !== bg.clientHeight && bg.clientHeight > 0) bg.height = bg.clientHeight;

    const ctx = _bgCtx;
    const w = bg.width, h = bg.height;

    // ── 背景グラデーション ──
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,   '#020215');
    grad.addColorStop(0.5, '#06063a');
    grad.addColorStop(1,   '#010110');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // ── 星 ──
    _stars.forEach(s => {
      s.phase += s.speed;
      const alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(s.phase));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.warm ? '#ffe8a0' : '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // ── 月（右上） ──
    const moonX = w * 0.82, moonY = h * 0.12, moonR = Math.min(w, h) * 0.055;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2.5);
    moonGlow.addColorStop(0, 'rgba(220,210,140,0.18)');
    moonGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#f8eeaa';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    // 月のクレーター
    ctx.fillStyle = 'rgba(200,180,80,0.3)';
    ctx.beginPath(); ctx.arc(moonX + moonR*0.3,  moonY - moonR*0.2, moonR*0.18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX - moonR*0.25, moonY + moonR*0.3, moonR*0.12, 0, Math.PI*2); ctx.fill();

    // ── 月明かりのグロウ（城の後ろ） ──
    const skyGlow = ctx.createRadialGradient(w * 0.5, h * 0.78, 0, w * 0.5, h * 0.78, w * 0.6);
    skyGlow.addColorStop(0,   'rgba(20,30,100,0.25)');
    skyGlow.addColorStop(0.6, 'rgba(5,10,50,0.10)');
    skyGlow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 0, w, h);

    // ── 城シルエット ──
    _drawCastle(ctx, w, h);

    _animId = requestAnimationFrame(() => _animate());
  }

  // ── 城シルエット描画 ─────────────────────────────────────
  function _drawCastle(ctx, w, h) {
    const base = h * 0.80;

    function tower(cx, tw, th, battlements) {
      ctx.fillRect(cx - tw / 2, base - th, tw, h);
      if (battlements) {
        const bw = tw * 0.18, bh = th * 0.07;
        const count = Math.max(2, Math.floor(tw / (bw * 2)));
        const spacing = tw / count;
        for (let i = 0; i < count; i++) {
          ctx.fillRect(cx - tw / 2 + i * spacing, base - th - bh, bw, bh + 1);
        }
      }
    }

    // 遠景の塔（薄暗い）
    ctx.fillStyle = '#030318';
    tower(w * 0.08,  w * 0.05, h * 0.12, false);
    tower(w * 0.18,  w * 0.04, h * 0.08, false);
    tower(w * 0.88,  w * 0.05, h * 0.12, false);
    tower(w * 0.78,  w * 0.04, h * 0.09, false);

    // 城本体
    ctx.fillStyle = '#01010e';
    // 外壁（横の壁）
    ctx.fillRect(w * 0.16, base - h * 0.10, w * 0.68, h);
    // 城壁の銃眼
    const wallMerlonW = w * 0.025, wallMerlonH = h * 0.015;
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(w * 0.16 + i * (w * 0.68 / 18), base - h * 0.10 - wallMerlonH, wallMerlonW, wallMerlonH + 1);
    }
    // 外側の塔（左右）
    tower(w * 0.18, w * 0.11, h * 0.18, true);
    tower(w * 0.82, w * 0.11, h * 0.18, true);
    // 中間の塔
    tower(w * 0.30, w * 0.08, h * 0.14, true);
    tower(w * 0.70, w * 0.08, h * 0.14, true);
    // 中央の高い塔（メイン）
    tower(w * 0.50, w * 0.10, h * 0.24, true);
    // メイン塔の窓（青白いライト）
    const winX = w * 0.50, winY = base - h * 0.20;
    const wg = ctx.createRadialGradient(winX, winY, 0, winX, winY, w * 0.04);
    wg.addColorStop(0, 'rgba(100,140,255,0.5)');
    wg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wg;
    ctx.fillRect(winX - w * 0.04, winY - h * 0.04, w * 0.08, h * 0.08);

    // 地平線（地面）
    ctx.fillRect(0, base, w, h);
  }

  // ── 紋章（エンブレム）描画 ────────────────────────────────
  function _drawEmblem(canvas) {
    const SZ = 144;
    canvas.width  = SZ;
    canvas.height = SZ;
    const ctx = canvas.getContext('2d');
    const cx = SZ / 2, cy = SZ / 2;
    const R  = SZ * 0.43;

    // 背景フィル（半透明ダークブルー）
    ctx.fillStyle = 'rgba(3,3,28,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.84, 0, Math.PI * 2);
    ctx.fill();

    // 外側のグロウ
    const outerGlow = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.3);
    outerGlow.addColorStop(0, 'rgba(212,170,0,0.12)');
    outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 外リング
    ctx.strokeStyle = '#d4aa00';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // 内リング
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.83, 0, Math.PI * 2);
    ctx.stroke();

    // 8本のティックマーク
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.87, cy + Math.sin(a) * R * 0.87);
      ctx.lineTo(cx + Math.cos(a) * R,         cy + Math.sin(a) * R);
      ctx.stroke();
    }

    // 4方向のダイアモンド飾り
    for (let i = 0; i < 4; i++) {
      const a  = (i / 4) * Math.PI * 2;
      const dx = cx + Math.cos(a) * (R + 5);
      const dy = cy + Math.sin(a) * (R + 5);
      const dr = 4.5;
      ctx.fillStyle = '#d4aa00';
      ctx.beginPath();
      ctx.moveTo(dx,      dy - dr);
      ctx.lineTo(dx + dr, dy);
      ctx.lineTo(dx,      dy + dr);
      ctx.lineTo(dx - dr, dy);
      ctx.closePath();
      ctx.fill();
    }

    // 剣（ブレード）
    ctx.fillStyle = '#ddeeff';
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy + R * 0.28);
    ctx.lineTo(cx + 3.5, cy + R * 0.28);
    ctx.lineTo(cx + 2.5, cy - R * 0.52);
    ctx.lineTo(cx,       cy - R * 0.70);
    ctx.lineTo(cx - 2.5, cy - R * 0.52);
    ctx.closePath();
    ctx.fill();
    // ブレードハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(cx,       cy - R * 0.70);
    ctx.lineTo(cx - 1,   cy - R * 0.50);
    ctx.lineTo(cx - 1,   cy + R * 0.28);
    ctx.lineTo(cx,       cy + R * 0.28);
    ctx.closePath();
    ctx.fill();

    // クロスガード（鍔）
    const gx = cx, gy = cy + R * 0.06;
    ctx.fillStyle = '#d4aa00';
    ctx.beginPath();
    ctx.moveTo(gx - R * 0.33, gy);
    ctx.lineTo(gx + R * 0.33, gy);
    ctx.lineTo(gx + R * 0.28, gy + R * 0.11);
    ctx.lineTo(gx + R * 0.08, gy + R * 0.11);
    ctx.lineTo(gx + R * 0.05, gy + R * 0.28);
    ctx.lineTo(gx - R * 0.05, gy + R * 0.28);
    ctx.lineTo(gx - R * 0.08, gy + R * 0.11);
    ctx.lineTo(gx - R * 0.28, gy + R * 0.11);
    ctx.closePath();
    ctx.fill();

    // グリップ（柄）
    ctx.fillStyle = '#7a3010';
    ctx.fillRect(cx - 3.5, cy + R * 0.28, 7, R * 0.30);
    // 柄の巻き
    ctx.fillStyle = '#d4aa00';
    [R * 0.32, R * 0.42, R * 0.50].forEach(oy => {
      ctx.fillRect(cx - 3.5, cy + oy, 7, 1.8);
    });

    // ポンメル（柄頭）
    ctx.fillStyle = '#d4aa00';
    ctx.beginPath();
    ctx.arc(cx, cy + R * 0.60, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cc2222';
    ctx.beginPath();
    ctx.arc(cx, cy + R * 0.60, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 4つのスパークル
    [
      { x: cx - R * 0.50, y: cy - R * 0.38 },
      { x: cx + R * 0.50, y: cy - R * 0.38 },
      { x: cx - R * 0.55, y: cy + R * 0.08 },
      { x: cx + R * 0.55, y: cy + R * 0.08 },
    ].forEach(p => _sparkle(ctx, p.x, p.y, 5.5));
  }

  function _sparkle(ctx, x, y, r) {
    ctx.fillStyle = '#d4aa00';
    for (let i = 0; i < 4; i++) {
      const a  = (i / 4) * Math.PI * 2 - Math.PI / 4;
      const ia = a + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a)  * r,       y + Math.sin(a)  * r);
      ctx.lineTo(x + Math.cos(ia) * r * 0.3, y + Math.sin(ia) * r * 0.3);
      ctx.lineTo(x + Math.cos(a + Math.PI/2) * r,    y + Math.sin(a + Math.PI/2) * r);
      ctx.lineTo(x + Math.cos(ia + Math.PI/2) * r * 0.3, y + Math.sin(ia + Math.PI/2) * r * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  return { init, stop };

})();
