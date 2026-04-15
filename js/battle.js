// ============================================================
//  battle.js — でこやまクエスト 戦闘エンジン
// ============================================================

const Battle = (() => {

  // ── 内部状態 ─────────────────────────────────────────────
  let bstate = {
    active     : false,
    enemy      : null,
    enemyHp    : 0,
    enemyMaxHp : 0,
    isBoss     : false,
    bossId     : null,
    phase2     : false,
    waitingCmd : false,
  };

  // ── 戦闘オーバーレイ DOM参照 ──────────────────────────────
  let elOverlay, elMapCanvas, elEnemyName, elHpFill, elHpNum, elBattleCanvas;

  function _initDom() {
    if (elOverlay) return; // 初期化済み
    elOverlay      = document.getElementById('battle-overlay');
    elMapCanvas    = document.getElementById('map-canvas');
    elEnemyName    = document.getElementById('battle-enemy-name-text');
    elHpFill       = document.getElementById('enemy-hp-fill');
    elHpNum        = document.getElementById('enemy-hp-num');
    elBattleCanvas = document.getElementById('battle-canvas');
  }

  // ── 戦闘画面を表示 ────────────────────────────────────────
  function _showBattleScreen(enemy) {
    _initDom();
    elMapCanvas.classList.add('hidden');
    elOverlay.classList.remove('hidden');

    // 敵名・HP表示
    elEnemyName.textContent = enemy.name;
    _updateHpBar(enemy.hp, enemy.hp);

    // 敵スプライトを描く
    _drawEnemy(enemy);
  }

  // ── 戦闘画面を隠す ────────────────────────────────────────
  function _hideBattleScreen() {
    _initDom();
    elOverlay.classList.add('hidden');
    elMapCanvas.classList.remove('hidden');
  }

  // ── HPバー更新 ────────────────────────────────────────────
  function _updateHpBar(hp, maxHp) {
    _initDom();
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    elHpFill.style.width = pct + '%';
    // HP残量で色変化
    if (pct > 50) {
      elHpFill.style.background = 'linear-gradient(90deg,#00cc66,#00ff88)';
    } else if (pct > 25) {
      elHpFill.style.background = 'linear-gradient(90deg,#ccaa00,#ffdd00)';
    } else {
      elHpFill.style.background = 'linear-gradient(90deg,#cc0000,#ff4444)';
    }
    if (elHpNum) elHpNum.textContent = Math.max(0, hp);
  }

  // ── 敵スプライト描画 ─────────────────────────────────────
  function _drawEnemy(enemy) {
    _initDom();
    const bc  = elBattleCanvas;
    const ctx = bc.getContext('2d');
    const W   = bc.width;
    const H   = bc.height;
    ctx.clearRect(0, 0, W, H);

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(W/2, H*0.88, W*0.28, H*0.06, 0, 0, Math.PI*2);
    ctx.fill();

    const col  = enemy.color || '#884488';
    const col2 = _darken(col, 0.6);
    const fn   = _spriteFns[enemy.id];
    if (fn) { fn(ctx, W, H, col, col2); }
    else if (enemy.isBoss) { _spriteFns._boss(ctx, W, H, col, col2); }
    else { _spriteFns._default(ctx, W, H, col, col2); }
  }

  // ── 個別スプライト関数マップ ────────────────────────────
  const _spriteFns = {

    // ── スライム ─────────────────────────────────────────
    slime(ctx, W, H, col) {
      const cx=W/2, cy=H*0.52, r=Math.min(W,H)*0.30;
      // しずく型の体
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r*1.2);
      ctx.quadraticCurveTo(cx + r*1.1, cy - r*0.2, cx + r*0.8, cy + r*0.5);
      ctx.quadraticCurveTo(cx, cy + r*1.1, cx - r*0.8, cy + r*0.5);
      ctx.quadraticCurveTo(cx - r*1.1, cy - r*0.2, cx, cy - r*1.2);
      ctx.fill();
      // ハイライト
      ctx.fillStyle = _lighten(col, 1.5);
      ctx.beginPath();
      ctx.ellipse(cx - r*0.2, cy - r*0.4, r*0.25, r*0.18, -0.3, 0, Math.PI*2);
      ctx.fill();
      // 目
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(cx-r*0.28, cy-r*0.05, r*0.08, r*0.12, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.28, cy-r*0.05, r*0.08, r*0.12, 0,0,Math.PI*2); ctx.fill();
      // にっこり口
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy + r*0.15, r*0.18, 0.2, Math.PI - 0.2);
      ctx.stroke();
    },

    // ── ドラキー ─────────────────────────────────────────
    drakee(ctx, W, H, col) {
      const cx=W/2, cy=H*0.48, r=Math.min(W,H)*0.18;
      // 翼（左）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - r*0.5, cy);
      ctx.quadraticCurveTo(cx - r*3.2, cy - r*1.8, cx - r*2.5, cy + r*0.5);
      ctx.quadraticCurveTo(cx - r*1.8, cy - r*0.2, cx - r*1.2, cy + r*0.8);
      ctx.quadraticCurveTo(cx - r*0.8, cy + r*0.1, cx - r*0.3, cy + r*0.5);
      ctx.closePath();
      ctx.fill();
      // 翼（右）
      ctx.beginPath();
      ctx.moveTo(cx + r*0.5, cy);
      ctx.quadraticCurveTo(cx + r*3.2, cy - r*1.8, cx + r*2.5, cy + r*0.5);
      ctx.quadraticCurveTo(cx + r*1.8, cy - r*0.2, cx + r*1.2, cy + r*0.8);
      ctx.quadraticCurveTo(cx + r*0.8, cy + r*0.1, cx + r*0.3, cy + r*0.5);
      ctx.closePath();
      ctx.fill();
      // 体（丸い）
      ctx.fillStyle = _lighten(col, 1.2);
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.3, r*0.9, r*1.0, 0, 0, Math.PI*2);
      ctx.fill();
      // 耳
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - r*0.5, cy - r*0.5);
      ctx.lineTo(cx - r*0.9, cy - r*1.5);
      ctx.lineTo(cx - r*0.1, cy - r*0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r*0.5, cy - r*0.5);
      ctx.lineTo(cx + r*0.9, cy - r*1.5);
      ctx.lineTo(cx + r*0.1, cy - r*0.3);
      ctx.fill();
      // 目
      ctx.fillStyle = '#ffee00';
      ctx.beginPath(); ctx.ellipse(cx-r*0.35,cy+r*0.1, r*0.18,r*0.22, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.35,cy+r*0.1, r*0.18,r*0.22, 0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(cx-r*0.32,cy+r*0.12, r*0.09,r*0.12, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.38,cy+r*0.12, r*0.09,r*0.12, 0,0,Math.PI*2); ctx.fill();
      // 牙
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cx - r*0.15, cy + r*0.55);
      ctx.lineTo(cx - r*0.05, cy + r*0.85);
      ctx.lineTo(cx + r*0.05, cy + r*0.55);
      ctx.fill();
    },

    // ── ゴースト ─────────────────────────────────────────
    ghost(ctx, W, H, col) {
      const cx=W/2, cy=H*0.42, r=Math.min(W,H)*0.26;
      // 体（上半身は丸、下は波打つ裾）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.lineTo(cx + r, cy + r*1.3);
      // 波打つ裾
      for (let i = 0; i < 5; i++) {
        const px = cx + r - (2*r/5)*(i+0.5);
        const py = cy + r*1.3 + ((i%2===0)?r*0.3:-r*0.1);
        ctx.quadraticCurveTo(cx + r - (2*r/5)*i - r*0.2, py, px, cy + r*1.3);
      }
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      // 半透明のぼんやり感
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      // 目（黒い穴）
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(cx-r*0.3, cy-r*0.05, r*0.12, r*0.18, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.3, cy-r*0.05, r*0.12, r*0.18, 0,0,Math.PI*2); ctx.fill();
      // 口（開いた穴）
      ctx.beginPath(); ctx.ellipse(cx, cy+r*0.35, r*0.12, r*0.15, 0,0,Math.PI*2); ctx.fill();
    },

    // ── ワイバーン ───────────────────────────────────────
    wyvern(ctx, W, H, col) {
      const cx=W/2, cy=H*0.50, r=Math.min(W,H)*0.22;
      const col2 = _darken(col, 0.6);
      // 翼（左）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - r*0.6, cy - r*0.3);
      ctx.lineTo(cx - r*3.0, cy - r*2.0);
      ctx.lineTo(cx - r*2.2, cy - r*0.5);
      ctx.lineTo(cx - r*1.8, cy - r*1.2);
      ctx.lineTo(cx - r*1.2, cy - r*0.2);
      ctx.closePath();
      ctx.fill();
      // 翼（右）
      ctx.beginPath();
      ctx.moveTo(cx + r*0.6, cy - r*0.3);
      ctx.lineTo(cx + r*3.0, cy - r*2.0);
      ctx.lineTo(cx + r*2.2, cy - r*0.5);
      ctx.lineTo(cx + r*1.8, cy - r*1.2);
      ctx.lineTo(cx + r*1.2, cy - r*0.2);
      ctx.closePath();
      ctx.fill();
      // 体
      ctx.fillStyle = _lighten(col, 1.15);
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.2, r*0.9, r*1.1, 0, 0, Math.PI*2);
      ctx.fill();
      // 首
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - r*0.25, cy - r*0.6);
      ctx.quadraticCurveTo(cx, cy - r*1.8, cx + r*0.15, cy - r*1.5);
      ctx.lineTo(cx + r*0.35, cy - r*0.5);
      ctx.closePath();
      ctx.fill();
      // 頭
      ctx.beginPath();
      ctx.ellipse(cx + r*0.05, cy - r*1.55, r*0.35, r*0.28, -0.2, 0, Math.PI*2);
      ctx.fill();
      // 目
      ctx.fillStyle = '#ff3300';
      ctx.beginPath(); ctx.ellipse(cx+r*0.15, cy-r*1.6, r*0.1, r*0.08, 0,0,Math.PI*2); ctx.fill();
      // 尻尾
      ctx.strokeStyle = col2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy + r*1.2);
      ctx.quadraticCurveTo(cx + r*1.5, cy + r*1.8, cx + r*2.0, cy + r*1.0);
      ctx.stroke();
      // 爪
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.ellipse(cx - r*0.4, cy + r*1.2, r*0.15, r*0.25, 0.2, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r*0.4, cy + r*1.2, r*0.15, r*0.25, -0.2, 0, Math.PI*2);
      ctx.fill();
    },

    // ── スケルトン ─────────────────────────────────────────
    skeleton(ctx, W, H, col) {
      const cx=W/2, cy=H*0.35, r=Math.min(W,H)*0.15;
      // 頭蓋骨
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r*1.0, r*1.1, 0, 0, Math.PI*2);
      ctx.fill();
      // 目の穴
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(cx-r*0.35, cy-r*0.1, r*0.22, r*0.28, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.35, cy-r*0.1, r*0.22, r*0.28, 0,0,Math.PI*2); ctx.fill();
      // 鼻の穴
      ctx.beginPath();
      ctx.moveTo(cx, cy + r*0.2);
      ctx.lineTo(cx - r*0.12, cy + r*0.45);
      ctx.lineTo(cx + r*0.12, cy + r*0.45);
      ctx.closePath();
      ctx.fill();
      // 歯
      ctx.fillStyle = col;
      ctx.fillRect(cx - r*0.45, cy + r*0.55, r*0.9, r*0.25);
      ctx.fillStyle = '#111';
      for (let i=0; i<4; i++) {
        ctx.fillRect(cx - r*0.4 + i*r*0.22, cy + r*0.55, r*0.02, r*0.25);
      }
      // 背骨
      ctx.fillStyle = col;
      ctx.fillRect(cx - r*0.12, cy + r*1.2, r*0.24, r*3.5);
      // 肋骨
      for (let i=0; i<3; i++) {
        const ry = cy + r*1.5 + i*r*0.7;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - r*0.12, ry);
        ctx.quadraticCurveTo(cx - r*0.8, ry + r*0.3, cx - r*0.6, ry + r*0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + r*0.12, ry);
        ctx.quadraticCurveTo(cx + r*0.8, ry + r*0.3, cx + r*0.6, ry + r*0.5);
        ctx.stroke();
      }
      // 剣
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(cx + r*1.2, cy - r*0.5, r*0.15, r*3.5);
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(cx + r*0.9, cy + r*0.3, r*0.6, r*0.2);
    },

    // ── ゾンビ ───────────────────────────────────────────
    zombie(ctx, W, H, col) {
      const cx=W/2, cy=H*0.38, r=Math.min(W,H)*0.16;
      const col2 = _darken(col, 0.7);
      // 体（前かがみ）
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.ellipse(cx + r*0.2, cy + r*2.0, r*0.9, r*1.8, 0.15, 0, Math.PI*2);
      ctx.fill();
      // ボロ布
      ctx.fillStyle = '#554433';
      ctx.beginPath();
      ctx.moveTo(cx - r*0.5, cy + r*1.0);
      ctx.lineTo(cx + r*0.9, cy + r*0.8);
      ctx.lineTo(cx + r*1.0, cy + r*3.5);
      ctx.lineTo(cx - r*0.3, cy + r*3.8);
      ctx.lineTo(cx - r*0.7, cy + r*3.2);
      ctx.closePath();
      ctx.fill();
      // 頭
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r*0.9, r*1.0, -0.2, 0, Math.PI*2);
      ctx.fill();
      // 目（左は閉じ、右は丸）
      ctx.fillStyle = '#111';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx-r*0.5,cy-r*0.1); ctx.lineTo(cx-r*0.15,cy+r*0.05); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx+r*0.35,cy-r*0.05, r*0.15,r*0.18, 0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#990000';
      ctx.beginPath(); ctx.ellipse(cx+r*0.35,cy-r*0.05, r*0.08,r*0.1, 0,0,Math.PI*2); ctx.fill();
      // 口（開いてうめく）
      ctx.fillStyle = '#331111';
      ctx.beginPath(); ctx.ellipse(cx+r*0.1,cy+r*0.5, r*0.2,r*0.3, 0.1,0,Math.PI*2); ctx.fill();
      // 腕（だらり）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx-r*1.0, cy+r*2.0, r*0.2, r*1.2, 0.3, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx+r*1.2, cy+r*1.5, r*0.2, r*1.0, -0.4, 0, Math.PI*2);
      ctx.fill();
    },

    // ── オーク ───────────────────────────────────────────
    orc(ctx, W, H, col) {
      const cx=W/2, cy=H*0.50, r=Math.min(W,H)*0.24;
      const col2 = _darken(col, 0.65);
      // 体（ずんぐり）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.4, r*1.05, r*1.2, 0, 0, Math.PI*2);
      ctx.fill();
      // 腰巻き
      ctx.fillStyle = '#554422';
      ctx.fillRect(cx - r*0.9, cy + r*1.0, r*1.8, r*0.5);
      // 頭
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*0.55, r*0.7, r*0.6, 0, 0, Math.PI*2);
      ctx.fill();
      // 耳（豚耳）
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(cx-r*0.65,cy-r*0.7, r*0.2,r*0.25, -0.3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.65,cy-r*0.7, r*0.2,r*0.25, 0.3,0,Math.PI*2); ctx.fill();
      // 鼻（豚鼻）
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(cx,cy-r*0.35, r*0.25,r*0.18, 0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(cx-r*0.08, cy-r*0.35, r*0.06, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.08, cy-r*0.35, r*0.06, 0, Math.PI*2); ctx.fill();
      // 目（怒り）
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.ellipse(cx-r*0.3, cy-r*0.65, r*0.12,r*0.1, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.3, cy-r*0.65, r*0.12,r*0.1, 0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(cx-r*0.3, cy-r*0.65, r*0.06, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.3, cy-r*0.65, r*0.06, 0, Math.PI*2); ctx.fill();
      // 牙
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cx-r*0.2,cy-r*0.15); ctx.lineTo(cx-r*0.12,cy-r*0.0); ctx.lineTo(cx-r*0.04,cy-r*0.15);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx+r*0.04,cy-r*0.15); ctx.lineTo(cx+r*0.12,cy-r*0.0); ctx.lineTo(cx+r*0.2,cy-r*0.15);
      ctx.fill();
      // こん棒
      ctx.fillStyle = '#6B4226';
      ctx.save();
      ctx.translate(cx + r*1.2, cy - r*0.3);
      ctx.rotate(0.5);
      ctx.fillRect(-r*0.1, -r*1.5, r*0.22, r*2.2);
      ctx.fillStyle = '#5A3520';
      ctx.beginPath(); ctx.ellipse(0, -r*1.5, r*0.25, r*0.3, 0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    },

    // ── あんこくきし ─────────────────────────────────────
    dark_knight(ctx, W, H, col) {
      const cx=W/2, cy=H*0.38, r=Math.min(W,H)*0.18;
      const col2 = _darken(col, 0.6);
      // マント
      ctx.fillStyle = '#1a0033';
      ctx.beginPath();
      ctx.moveTo(cx - r*1.2, cy - r*0.5);
      ctx.quadraticCurveTo(cx - r*1.5, cy + r*3.0, cx - r*0.5, cy + r*3.5);
      ctx.lineTo(cx + r*0.5, cy + r*3.5);
      ctx.quadraticCurveTo(cx + r*1.5, cy + r*3.0, cx + r*1.2, cy - r*0.5);
      ctx.closePath();
      ctx.fill();
      // 鎧体
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*1.0, r*0.85, r*1.3, 0, 0, Math.PI*2);
      ctx.fill();
      // 鎧の装飾線
      ctx.strokeStyle = _lighten(col, 1.4);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + r*2.2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r*0.7, cy + r*0.6);
      ctx.lineTo(cx + r*0.7, cy + r*0.6);
      ctx.stroke();
      // ヘルメット
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*0.4, r*0.65, r*0.7, 0, 0, Math.PI*2);
      ctx.fill();
      // バイザー（スリット目）
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - r*0.5, cy - r*0.55, r*1.0, r*0.15);
      // バイザー内の赤い目
      ctx.fillStyle = '#ff0000';
      ctx.beginPath(); ctx.arc(cx - r*0.2, cy - r*0.48, r*0.06, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r*0.2, cy - r*0.48, r*0.06, 0, Math.PI*2); ctx.fill();
      // 兜の飾り
      ctx.fillStyle = '#990033';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r*1.1);
      ctx.lineTo(cx - r*0.12, cy - r*0.6);
      ctx.lineTo(cx + r*0.12, cy - r*0.6);
      ctx.closePath();
      ctx.fill();
      // 剣
      ctx.fillStyle = '#888';
      ctx.save();
      ctx.translate(cx + r*1.3, cy);
      ctx.rotate(-0.3);
      ctx.fillRect(-r*0.06, -r*2.5, r*0.12, r*3.0);
      ctx.fillStyle = '#666';
      ctx.fillRect(-r*0.25, -r*0.1, r*0.5, r*0.15);
      ctx.restore();
    },

    // ── デスバット ─────────────────────────────────────────
    death_bat(ctx, W, H, col) {
      const cx=W/2, cy=H*0.45, r=Math.min(W,H)*0.22;
      // 大きな翼（左）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - r*0.4, cy);
      ctx.lineTo(cx - r*3.5, cy - r*1.2);
      ctx.quadraticCurveTo(cx - r*2.8, cy + r*0.3, cx - r*2.0, cy - r*0.5);
      ctx.quadraticCurveTo(cx - r*1.5, cy + r*0.5, cx - r*1.0, cy + r*0.2);
      ctx.closePath();
      ctx.fill();
      // 大きな翼（右）
      ctx.beginPath();
      ctx.moveTo(cx + r*0.4, cy);
      ctx.lineTo(cx + r*3.5, cy - r*1.2);
      ctx.quadraticCurveTo(cx + r*2.8, cy + r*0.3, cx + r*2.0, cy - r*0.5);
      ctx.quadraticCurveTo(cx + r*1.5, cy + r*0.5, cx + r*1.0, cy + r*0.2);
      ctx.closePath();
      ctx.fill();
      // 体
      ctx.fillStyle = _lighten(col, 1.3);
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.2, r*0.7, r*0.9, 0, 0, Math.PI*2);
      ctx.fill();
      // 目（赤く光る）
      ctx.fillStyle = '#ff0000';
      ctx.beginPath(); ctx.ellipse(cx-r*0.25, cy, r*0.15,r*0.12, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.25, cy, r*0.15,r*0.12, 0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff8888';
      ctx.beginPath(); ctx.arc(cx-r*0.22, cy-r*0.02, r*0.05, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.28, cy-r*0.02, r*0.05, 0, Math.PI*2); ctx.fill();
      // 牙
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cx-r*0.2,cy+r*0.35); ctx.lineTo(cx-r*0.1,cy+r*0.7); ctx.lineTo(cx,cy+r*0.35);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx,cy+r*0.35); ctx.lineTo(cx+r*0.1,cy+r*0.7); ctx.lineTo(cx+r*0.2,cy+r*0.35);
      ctx.fill();
      // 足（爪）
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(cx-r*0.3,cy+r*1.0, r*0.1,r*0.2, 0.2,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.3,cy+r*1.0, r*0.1,r*0.2, -0.2,0,Math.PI*2); ctx.fill();
    },

    // ── ヘルガード ───────────────────────────────────────
    hell_guard(ctx, W, H, col) {
      const cx=W/2, cy=H*0.38, r=Math.min(W,H)*0.20;
      const col2 = _darken(col, 0.6);
      // 体（鎧）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.8, r*1.0, r*1.5, 0, 0, Math.PI*2);
      ctx.fill();
      // 肩アーマー
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(cx-r*1.1,cy+r*0.1, r*0.4,r*0.3, -0.3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*1.1,cy+r*0.1, r*0.4,r*0.3, 0.3,0,Math.PI*2); ctx.fill();
      // 肩のスパイク
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.moveTo(cx-r*1.1,cy-r*0.15); ctx.lineTo(cx-r*1.2,cy-r*0.6); ctx.lineTo(cx-r*0.9,cy-r*0.15); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx+r*1.1,cy-r*0.15); ctx.lineTo(cx+r*1.2,cy-r*0.6); ctx.lineTo(cx+r*0.9,cy-r*0.15); ctx.fill();
      // 頭（角付き兜）
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*0.6, r*0.6, r*0.65, 0, 0, Math.PI*2);
      ctx.fill();
      // 角
      ctx.fillStyle = '#aa3300';
      ctx.beginPath(); ctx.moveTo(cx-r*0.4,cy-r*1.1); ctx.lineTo(cx-r*0.7,cy-r*1.8); ctx.lineTo(cx-r*0.2,cy-r*1.0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx+r*0.4,cy-r*1.1); ctx.lineTo(cx+r*0.7,cy-r*1.8); ctx.lineTo(cx+r*0.2,cy-r*1.0); ctx.fill();
      // 目（不気味な光）
      ctx.fillStyle = '#00ff66';
      ctx.beginPath(); ctx.ellipse(cx-r*0.22,cy-r*0.65, r*0.12,r*0.08, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.22,cy-r*0.65, r*0.12,r*0.08, 0,0,Math.PI*2); ctx.fill();
      // 盾（左手）
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.moveTo(cx-r*1.6, cy+r*0.3);
      ctx.lineTo(cx-r*1.9, cy-r*0.3);
      ctx.lineTo(cx-r*1.3, cy-r*0.3);
      ctx.lineTo(cx-r*1.1, cy+r*0.3);
      ctx.lineTo(cx-r*1.5, cy+r*0.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#444'; ctx.lineWidth=1.5; ctx.stroke();
      // 斧（右手）
      ctx.fillStyle = '#777';
      ctx.save();
      ctx.translate(cx + r*1.4, cy - r*0.2);
      ctx.rotate(-0.2);
      ctx.fillRect(-r*0.06, -r*2.0, r*0.12, r*3.0);
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.moveTo(r*0.06, -r*1.8);
      ctx.lineTo(r*0.5, -r*1.4);
      ctx.lineTo(r*0.06, -r*1.0);
      ctx.fill();
      ctx.restore();
    },

    // ══════════════════════════════════════════
    //  ボス
    // ══════════════════════════════════════════

    // ── アームライオン ───────────────────────────────────
    dungeon1_boss(ctx, W, H, col) {
      const cx=W/2, cy=H*0.42, r=Math.min(W,H)*0.28;
      const col2 = _darken(col, 0.6);
      // たてがみ
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*0.15, r*1.15, r*1.0, 0, 0, Math.PI*2);
      ctx.fill();
      // 体
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.5, r*0.95, r*1.1, 0, 0, Math.PI*2);
      ctx.fill();
      // 顔
      ctx.fillStyle = _lighten(col, 1.3);
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*0.2, r*0.6, r*0.55, 0, 0, Math.PI*2);
      ctx.fill();
      // 目（獣の目）
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.ellipse(cx-r*0.22,cy-r*0.3, r*0.14,r*0.1, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.22,cy-r*0.3, r*0.14,r*0.1, 0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(cx-r*0.22,cy-r*0.3, r*0.06,r*0.1, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.22,cy-r*0.3, r*0.06,r*0.1, 0,0,Math.PI*2); ctx.fill();
      // 鼻
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.ellipse(cx,cy-r*0.08, r*0.1,r*0.07, 0,0,Math.PI*2); ctx.fill();
      // 口と牙
      ctx.fillStyle = '#330000';
      ctx.beginPath();
      ctx.moveTo(cx-r*0.3,cy+r*0.08);
      ctx.quadraticCurveTo(cx,cy+r*0.35, cx+r*0.3,cy+r*0.08);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(cx-r*0.15,cy+r*0.08); ctx.lineTo(cx-r*0.08,cy+r*0.25); ctx.lineTo(cx-r*0.01,cy+r*0.08); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx+r*0.01,cy+r*0.08); ctx.lineTo(cx+r*0.08,cy+r*0.25); ctx.lineTo(cx+r*0.15,cy+r*0.08); ctx.fill();
      // 巨大な腕
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx - r*1.3, cy + r*0.5, r*0.4, r*0.8, 0.3, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r*1.3, cy + r*0.5, r*0.4, r*0.8, -0.3, 0, Math.PI*2);
      ctx.fill();
      // 爪
      ctx.fillStyle = '#ddd';
      [-1,1].forEach(s => {
        for (let i=0;i<3;i++) {
          ctx.beginPath();
          ctx.moveTo(cx+s*(r*1.3+r*0.3), cy+r*1.1+i*r*0.15);
          ctx.lineTo(cx+s*(r*1.3+r*0.7), cy+r*1.15+i*r*0.15);
          ctx.lineTo(cx+s*(r*1.3+r*0.3), cy+r*1.2+i*r*0.15);
          ctx.fill();
        }
      });
    },

    // ── ダークドラゴン ───────────────────────────────────
    dungeon2_boss(ctx, W, H, col) {
      const cx=W/2, cy=H*0.48, r=Math.min(W,H)*0.25;
      const col2 = _darken(col, 0.5);
      // 翼（左）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx-r*0.8, cy-r*0.5);
      ctx.lineTo(cx-r*3.2, cy-r*2.5);
      ctx.lineTo(cx-r*2.5, cy-r*1.0);
      ctx.lineTo(cx-r*2.0, cy-r*1.8);
      ctx.lineTo(cx-r*1.5, cy-r*0.5);
      ctx.lineTo(cx-r*1.2, cy-r*1.0);
      ctx.lineTo(cx-r*0.8, cy-r*0.2);
      ctx.closePath();
      ctx.fill();
      // 翼（右）
      ctx.beginPath();
      ctx.moveTo(cx+r*0.8, cy-r*0.5);
      ctx.lineTo(cx+r*3.2, cy-r*2.5);
      ctx.lineTo(cx+r*2.5, cy-r*1.0);
      ctx.lineTo(cx+r*2.0, cy-r*1.8);
      ctx.lineTo(cx+r*1.5, cy-r*0.5);
      ctx.lineTo(cx+r*1.2, cy-r*1.0);
      ctx.lineTo(cx+r*0.8, cy-r*0.2);
      ctx.closePath();
      ctx.fill();
      // 体
      ctx.fillStyle = _lighten(col, 1.3);
      ctx.beginPath();
      ctx.ellipse(cx, cy+r*0.3, r*1.0, r*1.2, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = col2; ctx.lineWidth=2; ctx.stroke();
      // 腹の鱗模様
      ctx.fillStyle = _lighten(col, 1.6);
      for (let i=0; i<4; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy-r*0.1+i*r*0.35, r*0.45-i*0.03, r*0.12, 0, 0, Math.PI*2);
        ctx.fill();
      }
      // 首と頭
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx-r*0.3, cy-r*0.7);
      ctx.quadraticCurveTo(cx-r*0.2, cy-r*2.0, cx, cy-r*1.8);
      ctx.quadraticCurveTo(cx+r*0.2, cy-r*2.0, cx+r*0.3, cy-r*0.7);
      ctx.closePath();
      ctx.fill();
      // 頭
      ctx.beginPath();
      ctx.ellipse(cx, cy-r*1.9, r*0.45, r*0.32, 0, 0, Math.PI*2);
      ctx.fill();
      // 目
      ctx.fillStyle = '#ff2200';
      ctx.beginPath(); ctx.ellipse(cx-r*0.18,cy-r*1.95, r*0.12,r*0.08, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.18,cy-r*1.95, r*0.12,r*0.08, 0,0,Math.PI*2); ctx.fill();
      // 口から火
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(cx-r*0.15, cy-r*1.6);
      ctx.quadraticCurveTo(cx, cy-r*1.2, cx+r*0.15, cy-r*1.6);
      ctx.fill();
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(cx-r*0.08, cy-r*1.6);
      ctx.quadraticCurveTo(cx, cy-r*1.3, cx+r*0.08, cy-r*1.6);
      ctx.fill();
      // 尻尾
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy+r*1.4);
      ctx.quadraticCurveTo(cx+r*1.5, cy+r*2.0, cx+r*2.2, cy+r*1.2);
      ctx.stroke();
    },

    // ── まおう ───────────────────────────────────────────
    maou(ctx, W, H, col) {
      const cx=W/2, cy=H*0.40, r=Math.min(W,H)*0.26;
      const col2 = _darken(col, 0.5);
      // マント
      ctx.fillStyle = '#1a0011';
      ctx.beginPath();
      ctx.moveTo(cx-r*1.5, cy-r*0.8);
      ctx.quadraticCurveTo(cx-r*2.0, cy+r*2.5, cx-r*1.0, cy+r*3.0);
      ctx.lineTo(cx+r*1.0, cy+r*3.0);
      ctx.quadraticCurveTo(cx+r*2.0, cy+r*2.5, cx+r*1.5, cy-r*0.8);
      ctx.closePath();
      ctx.fill();
      // マント裏地（赤）
      ctx.fillStyle = '#440000';
      ctx.beginPath();
      ctx.moveTo(cx-r*1.3, cy);
      ctx.quadraticCurveTo(cx-r*1.5, cy+r*2.2, cx-r*0.8, cy+r*2.8);
      ctx.lineTo(cx-r*0.3, cy+r*1.0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx+r*1.3, cy);
      ctx.quadraticCurveTo(cx+r*1.5, cy+r*2.2, cx+r*0.8, cy+r*2.8);
      ctx.lineTo(cx+r*0.3, cy+r*1.0);
      ctx.closePath();
      ctx.fill();
      // 体
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy+r*0.6, r*0.85, r*1.3, 0, 0, Math.PI*2);
      ctx.fill();
      // 顔
      ctx.fillStyle = _lighten(col, 1.3);
      ctx.beginPath();
      ctx.ellipse(cx, cy-r*0.4, r*0.6, r*0.65, 0, 0, Math.PI*2);
      ctx.fill();
      // 角（大きく2本）
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.moveTo(cx-r*0.35,cy-r*0.9); ctx.lineTo(cx-r*0.8,cy-r*2.0); ctx.lineTo(cx-r*0.1,cy-r*0.8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx+r*0.35,cy-r*0.9); ctx.lineTo(cx+r*0.8,cy-r*2.0); ctx.lineTo(cx+r*0.1,cy-r*0.8); ctx.fill();
      // 目（邪悪に光る）
      ctx.fillStyle = '#ffee00';
      ctx.beginPath(); ctx.ellipse(cx-r*0.25,cy-r*0.5, r*0.16,r*0.10, -0.15,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.25,cy-r*0.5, r*0.16,r*0.10, 0.15,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(cx-r*0.25,cy-r*0.5, r*0.08,r*0.10, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.25,cy-r*0.5, r*0.08,r*0.10, 0,0,Math.PI*2); ctx.fill();
      // 眉（怒り）
      ctx.strokeStyle = '#333'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(cx-r*0.5,cy-r*0.7); ctx.lineTo(cx-r*0.1,cy-r*0.58); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+r*0.5,cy-r*0.7); ctx.lineTo(cx+r*0.1,cy-r*0.58); ctx.stroke();
      // 口（不敵な笑み＋牙）
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(cx-r*0.35,cy-r*0.1);
      ctx.quadraticCurveTo(cx,cy+r*0.15, cx+r*0.35,cy-r*0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(cx-r*0.25,cy-r*0.1); ctx.lineTo(cx-r*0.18,cy+r*0.05); ctx.lineTo(cx-r*0.11,cy-r*0.1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx+r*0.11,cy-r*0.1); ctx.lineTo(cx+r*0.18,cy+r*0.05); ctx.lineTo(cx+r*0.25,cy-r*0.1); ctx.fill();
      // 宝玉（胸元）
      ctx.fillStyle = '#aa00ff';
      ctx.beginPath(); ctx.arc(cx, cy+r*0.2, r*0.15, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#dd88ff';
      ctx.beginPath(); ctx.arc(cx-r*0.04, cy+r*0.16, r*0.05, 0, Math.PI*2); ctx.fill();
    },

    // ── しんのまおう ─────────────────────────────────────
    true_maou(ctx, W, H, col) {
      const cx=W/2, cy=H*0.38, r=Math.min(W,H)*0.28;
      const col2 = _darken(col, 0.4);

      // === 背景オーラ（暗黒の炎） ===
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const fx = cx + Math.cos(angle) * r * 1.8;
        const fy = cy + r*0.5 + Math.sin(angle) * r * 1.5;
        const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r*0.6);
        grad.addColorStop(0, 'rgba(180,0,30,0.25)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // === マント（巨大・翼のように広がる） ===
      ctx.fillStyle = '#0a0008';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r*0.5);
      ctx.quadraticCurveTo(cx - r*2.8, cy - r*0.5, cx - r*2.2, cy + r*3.2);
      ctx.lineTo(cx - r*0.8, cy + r*2.5);
      ctx.lineTo(cx, cy + r*1.5);
      ctx.lineTo(cx + r*0.8, cy + r*2.5);
      ctx.lineTo(cx + r*2.2, cy + r*3.2);
      ctx.quadraticCurveTo(cx + r*2.8, cy - r*0.5, cx, cy - r*0.5);
      ctx.closePath();
      ctx.fill();
      // マント裏地（深紅）
      ctx.fillStyle = '#550010';
      ctx.beginPath();
      ctx.moveTo(cx - r*1.8, cy + r*1.5);
      ctx.quadraticCurveTo(cx - r*1.5, cy + r*2.8, cx - r*0.8, cy + r*2.5);
      ctx.lineTo(cx - r*0.4, cy + r*1.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r*1.8, cy + r*1.5);
      ctx.quadraticCurveTo(cx + r*1.5, cy + r*2.8, cx + r*0.8, cy + r*2.5);
      ctx.lineTo(cx + r*0.4, cy + r*1.2);
      ctx.closePath();
      ctx.fill();

      // === 鎧（胸甲） ===
      ctx.fillStyle = '#2a0008';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.5, r*0.9, r*1.2, 0, 0, Math.PI*2);
      ctx.fill();
      // 鎧の装飾（金のライン）
      ctx.strokeStyle = '#aa7700';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r*0.5);
      ctx.lineTo(cx, cy + r*1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.2, r*0.7, r*0.15, 0, 0, Math.PI*2);
      ctx.stroke();

      // === 顔（より威圧的） ===
      ctx.fillStyle = _lighten(col, 1.2);
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*0.45, r*0.6, r*0.65, 0, 0, Math.PI*2);
      ctx.fill();

      // === 角（4本・大きく曲がる） ===
      ctx.fillStyle = '#1a1a1a';
      // 外側の大きな角
      ctx.beginPath();
      ctx.moveTo(cx - r*0.45, cy - r*0.95);
      ctx.quadraticCurveTo(cx - r*1.3, cy - r*1.8, cx - r*1.0, cy - r*2.3);
      ctx.quadraticCurveTo(cx - r*0.8, cy - r*1.5, cx - r*0.2, cy - r*0.85);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r*0.45, cy - r*0.95);
      ctx.quadraticCurveTo(cx + r*1.3, cy - r*1.8, cx + r*1.0, cy - r*2.3);
      ctx.quadraticCurveTo(cx + r*0.8, cy - r*1.5, cx + r*0.2, cy - r*0.85);
      ctx.closePath();
      ctx.fill();
      // 内側の小さな角
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.moveTo(cx - r*0.2, cy - r*1.0);
      ctx.lineTo(cx - r*0.45, cy - r*1.6);
      ctx.lineTo(cx - r*0.05, cy - r*0.9);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r*0.2, cy - r*1.0);
      ctx.lineTo(cx + r*0.45, cy - r*1.6);
      ctx.lineTo(cx + r*0.05, cy - r*0.9);
      ctx.fill();

      // === 目（燃える赤） ===
      // グロウ
      const eyeGrad1 = ctx.createRadialGradient(cx - r*0.25, cy - r*0.5, 0, cx - r*0.25, cy - r*0.5, r*0.25);
      eyeGrad1.addColorStop(0, 'rgba(255,60,0,0.6)');
      eyeGrad1.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = eyeGrad1;
      ctx.fillRect(cx - r*0.5, cy - r*0.75, r*0.5, r*0.5);
      const eyeGrad2 = ctx.createRadialGradient(cx + r*0.25, cy - r*0.5, 0, cx + r*0.25, cy - r*0.5, r*0.25);
      eyeGrad2.addColorStop(0, 'rgba(255,60,0,0.6)');
      eyeGrad2.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = eyeGrad2;
      ctx.fillRect(cx, cy - r*0.75, r*0.5, r*0.5);
      // 目本体
      ctx.fillStyle = '#ff2200';
      ctx.beginPath(); ctx.ellipse(cx - r*0.25, cy - r*0.5, r*0.16, r*0.09, -0.1, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + r*0.25, cy - r*0.5, r*0.16, r*0.09, 0.1, 0, Math.PI*2); ctx.fill();
      // 瞳
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.ellipse(cx - r*0.25, cy - r*0.5, r*0.06, r*0.09, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + r*0.25, cy - r*0.5, r*0.06, r*0.09, 0, 0, Math.PI*2); ctx.fill();

      // === 眉（怒りの三日月） ===
      ctx.strokeStyle = '#1a0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - r*0.55, cy - r*0.75);
      ctx.quadraticCurveTo(cx - r*0.3, cy - r*0.7, cx - r*0.08, cy - r*0.58);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r*0.55, cy - r*0.75);
      ctx.quadraticCurveTo(cx + r*0.3, cy - r*0.7, cx + r*0.08, cy - r*0.58);
      ctx.stroke();

      // === 口（邪悪な笑み＋大きな牙） ===
      ctx.fillStyle = '#0a0000';
      ctx.beginPath();
      ctx.moveTo(cx - r*0.4, cy - r*0.12);
      ctx.quadraticCurveTo(cx, cy + r*0.2, cx + r*0.4, cy - r*0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      // 上の牙
      ctx.beginPath(); ctx.moveTo(cx-r*0.3,cy-r*0.12); ctx.lineTo(cx-r*0.22,cy+r*0.08); ctx.lineTo(cx-r*0.14,cy-r*0.12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx+r*0.14,cy-r*0.12); ctx.lineTo(cx+r*0.22,cy+r*0.08); ctx.lineTo(cx+r*0.3,cy-r*0.12); ctx.fill();
      // 下の牙
      ctx.beginPath(); ctx.moveTo(cx-r*0.08,cy+r*0.08); ctx.lineTo(cx-r*0.02,cy-r*0.05); ctx.lineTo(cx+r*0.04,cy+r*0.08); ctx.fill();

      // === 宝玉（胸元・禍々しい赤紫） ===
      const gemGrad = ctx.createRadialGradient(cx - r*0.05, cy + r*0.15, 0, cx, cy + r*0.2, r*0.2);
      gemGrad.addColorStop(0, '#ff44aa');
      gemGrad.addColorStop(0.5, '#aa00cc');
      gemGrad.addColorStop(1, '#330044');
      ctx.fillStyle = gemGrad;
      ctx.beginPath(); ctx.arc(cx, cy + r*0.2, r*0.18, 0, Math.PI*2); ctx.fill();
      // 宝玉の光
      ctx.fillStyle = 'rgba(255,150,255,0.5)';
      ctx.beginPath(); ctx.arc(cx - r*0.05, cy + r*0.14, r*0.06, 0, Math.PI*2); ctx.fill();

      // === 手（爪付き） ===
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.ellipse(cx - r*1.4, cy + r*0.6, r*0.25, r*0.5, 0.4, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r*1.4, cy + r*0.6, r*0.25, r*0.5, -0.4, 0, Math.PI*2);
      ctx.fill();
      // 爪
      ctx.fillStyle = '#ddd';
      [-1, 1].forEach(s => {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + s*(r*1.4 + r*0.2), cy + r*0.9 + i*r*0.12);
          ctx.lineTo(cx + s*(r*1.4 + r*0.5), cy + r*0.95 + i*r*0.12);
          ctx.lineTo(cx + s*(r*1.4 + r*0.2), cy + r*1.0 + i*r*0.12);
          ctx.fill();
        }
      });
    },

    // ── ゴーレム ──────────────────────────────────────────
    golem(ctx, W, H, col) {
      const cx=W/2, cy=H*0.42, r=Math.min(W,H)*0.30;
      const col2 = _darken(col, 0.6);
      // 体（巨大な岩の塊）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy+r*0.3, r*1.1, r*1.3, 0, 0, Math.PI*2);
      ctx.fill();
      // 岩のテクスチャ
      ctx.fillStyle = _lighten(col, 1.2);
      ctx.beginPath();
      ctx.ellipse(cx-r*0.3, cy, r*0.35, r*0.25, -0.2, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.ellipse(cx+r*0.4, cy+r*0.6, r*0.3, r*0.2, 0.3, 0, Math.PI*2);
      ctx.fill();
      // 頭（小さめ）
      ctx.fillStyle = _lighten(col, 1.1);
      ctx.beginPath();
      ctx.ellipse(cx, cy-r*0.7, r*0.5, r*0.45, 0, 0, Math.PI*2);
      ctx.fill();
      // ひび割れ
      ctx.strokeStyle = col2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx-r*0.1, cy-r*0.9);
      ctx.lineTo(cx+r*0.05, cy-r*0.5);
      ctx.lineTo(cx-r*0.15, cy-r*0.3);
      ctx.stroke();
      // 目（赤く光る穴）
      ctx.fillStyle = '#cc3300';
      ctx.beginPath(); ctx.ellipse(cx-r*0.2, cy-r*0.75, r*0.09, r*0.06, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.2, cy-r*0.75, r*0.09, r*0.06, 0,0,Math.PI*2); ctx.fill();
      // 目のグロウ
      ctx.fillStyle = 'rgba(255,80,0,0.3)';
      ctx.beginPath(); ctx.arc(cx-r*0.2, cy-r*0.75, r*0.15, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.2, cy-r*0.75, r*0.15, 0, Math.PI*2); ctx.fill();
      // 腕（太い岩の腕）
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx-r*1.3, cy+r*0.2, r*0.35, r*0.7, 0.3, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx+r*1.3, cy+r*0.2, r*0.35, r*0.7, -0.3, 0, Math.PI*2);
      ctx.fill();
      // 拳
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.arc(cx-r*1.4, cy+r*0.8, r*0.25, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*1.4, cy+r*0.8, r*0.25, 0, Math.PI*2); ctx.fill();
      // 脚
      ctx.fillStyle = col;
      ctx.fillRect(cx-r*0.55, cy+r*1.3, r*0.4, r*0.5);
      ctx.fillRect(cx+r*0.15, cy+r*1.3, r*0.4, r*0.5);
    },

    // ── ミミック ──────────────────────────────────────────
    mimic(ctx, W, H, col) {
      const cx=W/2, cy=H*0.48, r=Math.min(W,H)*0.28;
      const col2 = _darken(col, 0.6);
      // 宝箱の蓋（開いた状態）
      ctx.fillStyle = col;
      ctx.fillRect(cx - r*1.0, cy - r*0.3, r*2.0, r*0.5);
      // 蓋の上部（半開き）
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.moveTo(cx - r*1.0, cy - r*0.3);
      ctx.lineTo(cx - r*0.8, cy - r*1.3);
      ctx.lineTo(cx + r*0.8, cy - r*1.3);
      ctx.lineTo(cx + r*1.0, cy - r*0.3);
      ctx.closePath();
      ctx.fill();
      // 蓋の金具
      ctx.fillStyle = '#daa520';
      ctx.fillRect(cx - r*0.7, cy - r*1.2, r*1.4, r*0.12);
      // 箱の本体
      ctx.fillStyle = _lighten(col, 1.15);
      ctx.fillRect(cx - r*1.0, cy + r*0.2, r*2.0, r*1.2);
      // 金の帯
      ctx.fillStyle = '#daa520';
      ctx.fillRect(cx - r*1.0, cy + r*0.2, r*2.0, r*0.15);
      ctx.fillRect(cx - r*1.0, cy + r*1.1, r*2.0, r*0.15);
      // 錠前風装飾
      ctx.beginPath();
      ctx.arc(cx, cy + r*0.65, r*0.18, 0, Math.PI*2);
      ctx.fillStyle = '#daa520';
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(cx, cy + r*0.65, r*0.08, 0, Math.PI*2);
      ctx.fill();
      // 口（箱の蓋と本体の間）の中に牙
      ctx.fillStyle = '#cc1111';
      ctx.fillRect(cx - r*0.9, cy - r*0.1, r*1.8, r*0.3);
      // 牙（上）
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        const tx = cx - r*0.7 + i*r*0.35;
        ctx.beginPath();
        ctx.moveTo(tx, cy - r*0.1);
        ctx.lineTo(tx + r*0.08, cy + r*0.15);
        ctx.lineTo(tx + r*0.16, cy - r*0.1);
        ctx.fill();
      }
      // 牙（下）
      for (let i = 0; i < 5; i++) {
        const tx = cx - r*0.7 + i*r*0.35;
        ctx.beginPath();
        ctx.moveTo(tx, cy + r*0.2);
        ctx.lineTo(tx + r*0.08, cy + r*0.0);
        ctx.lineTo(tx + r*0.16, cy + r*0.2);
        ctx.fill();
      }
      // 目（蓋の内側に赤い目）
      ctx.fillStyle = '#ff2200';
      ctx.beginPath(); ctx.ellipse(cx-r*0.35, cy-r*0.8, r*0.18, r*0.14, 0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.35, cy-r*0.8, r*0.18, r*0.14, 0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(cx-r*0.35, cy-r*0.8, r*0.08, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.35, cy-r*0.8, r*0.08, 0, Math.PI*2); ctx.fill();
      // 舌
      ctx.fillStyle = '#ff5588';
      ctx.beginPath();
      ctx.moveTo(cx - r*0.1, cy + r*0.05);
      ctx.quadraticCurveTo(cx, cy + r*0.4, cx + r*0.15, cy + r*0.1);
      ctx.quadraticCurveTo(cx, cy + r*0.25, cx - r*0.1, cy + r*0.05);
      ctx.fill();
    },

    // ── はぐれメタル ──────────────────────────────────────
    metal_slime(ctx, W, H, col) {
      const cx=W/2, cy=H*0.50, r=Math.min(W,H)*0.28;
      // メタリックなしずく型の体
      const grad = ctx.createRadialGradient(cx-r*0.2,cy-r*0.3,0, cx,cy,r*1.2);
      grad.addColorStop(0,'#f0f0ff');
      grad.addColorStop(0.4,'#b0b0d0');
      grad.addColorStop(1,'#606080');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy-r*1.1);
      ctx.quadraticCurveTo(cx+r*1.0,cy-r*0.1, cx+r*0.7,cy+r*0.5);
      ctx.quadraticCurveTo(cx,cy+r*0.9, cx-r*0.7,cy+r*0.5);
      ctx.quadraticCurveTo(cx-r*1.0,cy-r*0.1, cx,cy-r*1.1);
      ctx.fill();
      // 光沢
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(cx-r*0.2,cy-r*0.4, r*0.2,r*0.12, -0.4,0,Math.PI*2);
      ctx.fill();
      // 目
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(cx-r*0.25,cy-r*0.05,r*0.07,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.25,cy-r*0.05,r*0.07,0,Math.PI*2); ctx.fill();
      // にやり口
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx,cy+r*0.2, r*0.15, 0.1, Math.PI-0.1);
      ctx.stroke();
    },

    // ── ゴールドマン ─────────────────────────────────────
    goldman(ctx, W, H, col) {
      const cx=W/2, cy=H*0.45, r=Math.min(W,H)*0.26;
      // 体（金色のずんぐり）
      const grad = ctx.createRadialGradient(cx-r*0.2,cy-r*0.2,0, cx,cy+r*0.3,r*1.5);
      grad.addColorStop(0,'#ffe870');
      grad.addColorStop(0.5,'#daa520');
      grad.addColorStop(1,'#8b6914');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx,cy+r*0.3, r*1.0,r*1.3, 0,0,Math.PI*2);
      ctx.fill();
      // 頭
      ctx.beginPath();
      ctx.ellipse(cx,cy-r*0.5, r*0.65,r*0.6, 0,0,Math.PI*2);
      ctx.fill();
      // 金の光沢
      ctx.fillStyle = 'rgba(255,255,200,0.4)';
      ctx.beginPath();
      ctx.ellipse(cx-r*0.3,cy-r*0.7, r*0.25,r*0.15, -0.3,0,Math.PI*2);
      ctx.fill();
      // 目（宝石風）
      ctx.fillStyle = '#cc0000';
      ctx.beginPath(); ctx.arc(cx-r*0.25,cy-r*0.55,r*0.1,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.25,cy-r*0.55,r*0.1,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff4444';
      ctx.beginPath(); ctx.arc(cx-r*0.22,cy-r*0.57,r*0.04,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.28,cy-r*0.57,r*0.04,0,Math.PI*2); ctx.fill();
      // 口
      ctx.fillStyle = '#8b4513';
      ctx.beginPath();
      ctx.moveTo(cx-r*0.2,cy-r*0.25);
      ctx.quadraticCurveTo(cx,cy-r*0.1, cx+r*0.2,cy-r*0.25);
      ctx.closePath();
      ctx.fill();
      // 腕
      ctx.fillStyle = '#daa520';
      ctx.beginPath(); ctx.ellipse(cx-r*1.1,cy+r*0.3, r*0.22,r*0.5, 0.3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*1.1,cy+r*0.3, r*0.22,r*0.5, -0.3,0,Math.PI*2); ctx.fill();
      // Gマーク
      ctx.fillStyle = '#8b6914';
      ctx.font = `bold ${r*0.7}px 'DotGothic16',monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', cx, cy+r*0.35);
    },

    // ── デフォルト（未定義の敵用） ───────────────────────
    _default(ctx, W, H, col) {
      const cx=W/2, cy=H*0.5, r=Math.min(W,H)*0.28;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(cx,cy,r,r*1.1,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(cx-r*0.3,cy-r*0.1,r*0.15,r*0.18,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx+r*0.3,cy-r*0.1,r*0.15,r*0.18,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(cx-r*0.28,cy-r*0.1,r*0.08,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+r*0.32,cy-r*0.1,r*0.08,0,Math.PI*2); ctx.fill();
    },
    _boss(ctx, W, H, col) {
      _spriteFns._default(ctx,W,H,col);
    },
  }; // end _spriteFns

  // ── 色操作ユーティリティ ─────────────────────────────────
  function _parseColor(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return [r,g,b];
  }
  function _darken(hex, factor) {
    try {
      const [r,g,b] = _parseColor(hex);
      return `rgb(${Math.floor(r*factor)},${Math.floor(g*factor)},${Math.floor(b*factor)})`;
    } catch(e) { return hex; }
  }
  function _lighten(hex, factor) {
    try {
      const [r,g,b] = _parseColor(hex);
      return `rgb(${Math.min(255,Math.floor(r*factor))},${Math.min(255,Math.floor(g*factor))},${Math.min(255,Math.floor(b*factor))})`;
    } catch(e) { return hex; }
  }

  // ── 戦闘開始 ─────────────────────────────────────────────
  function start(enemyDef, isBoss = false, bossId = null) {
    bstate.active     = true;
    bstate.enemy      = { ...enemyDef };
    bstate.enemyHp    = enemyDef.hp;
    bstate.enemyMaxHp = enemyDef.hp;
    bstate.isBoss     = isBoss;
    bstate.bossId     = bossId;
    bstate.phase2     = false;
    bstate.waitingCmd = false;
    bstate.trueMaou   = false;
    bstate.enemyMp    = enemyDef.mp || 0;

    MapEngine.setMoveLock(true);
    UI.clearMessage(); // 残留メッセージをクリア
    _showBattleScreen(bstate.enemy);

    if (isBoss) Sound.bossEncounter(); else Sound.encounter();

    const msg = isBoss
      ? `${enemyDef.name}が\nあらわれた！`
      : `${enemyDef.name}に\nであった！`;

    UI.showMessage(msg, () => _waitCommand());
  }

  // ── コマンド入力待ち ──────────────────────────────────────
  function _waitCommand() {
    // 毒ダメージ（ターン開始時）
    if (Game.isPoisoned() && bstate.active) {
      const pdmg = _rand(3, 6);
      Game.takeDamage(pdmg);
      Sound.poisonTick();
      UI.showMessage(`どくで　${pdmg}の　ダメージ！`, () => {
        if (Game.getPlayer().hp <= 0) { _playerDead(); return; }
        bstate.waitingCmd = true;
        UI.showBattleMenu(true);
      });
      return;
    }
    bstate.waitingCmd = true;
    UI.showBattleMenu(true);
  }

  // ── コマンド実行 ──────────────────────────────────────────
  function execCommand(cmd) {
    if (!bstate.active || !bstate.waitingCmd) return;
    bstate.waitingCmd = false;
    UI.showBattleMenu(false);
    switch (cmd) {
      case 'fight': _playerAttack(); break;
      case 'run':   _playerRun();    break;
    }
  }

  // ── プレイヤー：通常攻撃 ─────────────────────────────────
  function _playerAttack() {
    const player = Game.getPlayer();
    const enemy  = bstate.enemy;
    let atkBonus = 0;
    if (bstate.bossId === 'maou' && player.weapon === 'holy_sword') atkBonus = 20;
    if (bstate.bossId === 'maou' && player.weapon === 'kings_sword') atkBonus = 30;

    // かいしんのいちげき判定（1/16 ≈ 6%）
    const isCrit = Math.random() < 1/16;
    let dmg;
    if (enemy.physImmune) {
      dmg = 1; // 物理免疫
    } else {
      const normalDmg = _calcDamage(player.atk + atkBonus, enemy.def);
      dmg = isCrit ? normalDmg * 2 : normalDmg;
    }
    bstate.enemyHp -= dmg;
    _updateHpBar(bstate.enemyHp, bstate.enemyMaxHp);

    function _afterAtk() {
      if (bstate.enemyHp <= 0) {
        _enemyDead();
      } else if (bstate.isBoss && enemy.phase2Hp && bstate.enemyHp <= enemy.phase2Hp && !bstate.phase2) {
        bstate.phase2 = true;
        UI.showMessage(`${enemy.name}は　まだ　たたかう\nちからが　のこっている！`, () => _enemyTurn());
      } else {
        _enemyTurn();
      }
    }

    if (isCrit) {
      Sound.critical();
      UI.showMessage(`でこやまの　こうげき！\nかいしんの　いちげき！！\n${enemy.name}に　${dmg}の　ダメージ！`, _afterAtk);
    } else {
      Sound.attack();
      UI.showMessage(`でこやまの　こうげき！\n${enemy.name}に　${dmg}の　ダメージ！`, _afterAtk);
    }
  }

  // ── プレイヤー：呪文 ─────────────────────────────────────
  function execSpell(spellId) {
    UI.hideAllSubMenus();
    const spell  = GameData.SPELLS[spellId];
    const player = Game.getPlayer();
    if (player.mp < spell.mp) {
      UI.showMessage('MPが　たりない！', () => _waitCommand());
      return;
    }
    Game.useMp(spell.mp);
    if (spell.type === 'heal') {
      let heal = _rand(spell.power[0], spell.power[1]);
      if (Game.isHealBoosted()) heal = Math.floor(heal * 1.3);
      Game.healHp(heal);
      Sound.heal();
      UI.showMessage(`${spell.name}！\nでこやまの　HPが　${heal}　かいふくした！`, () => _enemyTurn());
    } else if (spell.type === 'attack') {
      let dmg = _rand(spell.power[0], spell.power[1]);
      if (Game.isSpellDoubled()) dmg = dmg * 2;
      bstate.enemyHp -= dmg;
      _updateHpBar(bstate.enemyHp, bstate.enemyMaxHp);
      Sound.magicAttack();
      UI.showMessage(`${spell.name}！\n${bstate.enemy.name}に　${dmg}の　ダメージ！`, () => {
        if (bstate.enemyHp <= 0) _enemyDead(); else _enemyTurn();
      });
    }
  }

  // ── プレイヤー：どうぐ ────────────────────────────────────
  function execItem(itemId) {
    UI.hideAllSubMenus();
    const item = GameData.ITEMS[itemId];
    if (item.effect === 'heal') {
      Game.removeItem(itemId);
      Game.healHp(item.power);
      Sound.heal();
      UI.showMessage(`${item.name}をつかった！\nHPが　${item.power}　かいふくした！`, () => _enemyTurn());
    } else if (item.effect === 'mp_heal') {
      Game.removeItem(itemId);
      const healAmt = item.power > 0 ? item.power : Math.floor(Game.getPlayer().maxMp * 0.8);
      Game.healMp(healAmt);
      Sound.heal();
      UI.showMessage(`${item.name}をつかった！\nMPが　${healAmt}　かいふくした！`, () => _enemyTurn());
    } else if (item.effect === 'cure_poison') {
      Game.removeItem(itemId);
      Game.setPoison(false);
      Sound.curePoison();
      UI.showMessage(`${item.name}をつかった！\nどくが　なおった！`, () => _enemyTurn());
    } else if (item.effect === 'elixir') {
      Game.removeItem(itemId);
      Game.healHp(9999);
      Game.healMp(9999);
      Sound.heal();
      UI.showMessage(`${item.name}をつかった！\nHPとMPが　ぜんかいふくした！`, () => _enemyTurn());
    } else {
      UI.showMessage('いまは　つかえない。', () => _waitCommand());
    }
  }

  // ── プレイヤー：にげる ────────────────────────────────────
  function _playerRun() {
    if (bstate.isBoss) {
      UI.showMessage('まおうのまえから\nにげることはできない！', () => _waitCommand());
      return;
    }
    if (Math.random() < 0.70) {
      Sound.runOk();
      UI.showMessage('うまく　にげきれた！', () => _endBattle(false));
    } else {
      Sound.runFail();
      UI.showMessage('しかし　まわりこまれた！', () => _enemyTurn());
    }
  }

  // ── 敵のターン ────────────────────────────────────────────
  function _enemyTurn() {
    if (!bstate.active) return;
    const enemy  = bstate.enemy;
    const player = Game.getPlayer();

    // 真の魔王: HP半分以下でベホイミ優先（80%の確率）
    if (bstate.trueMaou && bstate.enemyHp <= bstate.enemyMaxHp * 0.5) {
      const behoimi = GameData.SPELLS['behoimi'];
      if (behoimi && bstate.enemyMp >= behoimi.mp && Math.random() < 0.8) {
        bstate.enemyMp -= behoimi.mp;
        const heal = _rand(behoimi.power[0], behoimi.power[1]);
        bstate.enemyHp = Math.min(bstate.enemyMaxHp, bstate.enemyHp + heal);
        _updateHpBar(bstate.enemyHp, bstate.enemyMaxHp);
        Sound.heal();
        UI.showMessage(`${enemy.name}は\nベホイミを　となえた！\nHPが　${heal}　かいふくした！`, () => _waitCommand());
        return;
      }
    }

    // 通常の呪文使用（30%の確率）
    if (enemy.spells && enemy.spells.length > 0 && Math.random() < 0.3) {
      const spellId = enemy.spells[Math.floor(Math.random() * enemy.spells.length)];
      const spell   = GameData.SPELLS[spellId];
      if (spell.type === 'attack') {
        const dmg = _rand(spell.power[0], spell.power[1]);
        _applyPlayerDamage(dmg, `${enemy.name}は　${spell.name}をとなえた！\nでこやまは　${dmg}の　ダメージをうけた！`);
        return;
      }
      // 通常ボスの回復呪文（HP半分以下で使用、MP不問）
      if (spell.type === 'heal' && bstate.enemyHp <= bstate.enemyMaxHp * 0.5) {
        const heal = _rand(spell.power[0], spell.power[1]);
        bstate.enemyHp = Math.min(bstate.enemyMaxHp, bstate.enemyHp + heal);
        _updateHpBar(bstate.enemyHp, bstate.enemyMaxHp);
        Sound.heal();
        UI.showMessage(`${enemy.name}は\n${spell.name}を　となえた！\nHPが　${heal}　かいふくした！`, () => _waitCommand());
        return;
      }
    }
    // つうこんのいちげき判定（通常1/16、ボス1/10）
    const critRate = bstate.isBoss ? 1/10 : 1/16;
    const isEnemyCrit = Math.random() < critRate;
    const atkMult = bstate.phase2 ? (bstate.trueMaou ? 1.4 : 1.3) : 1.0;

    if (isEnemyCrit) {
      // DEFの半分しか効かない + ATK1.5倍
      const rawAtk = Math.floor(enemy.atk * atkMult * 1.5);
      const dmg = _calcDamage(rawAtk, Math.floor(player.def * 0.5));
      Sound.enemyCritical();
      _applyPlayerDamage(dmg, `${enemy.name}の　つうこんの　いちげき！！\nでこやまは　${dmg}の　ダメージをうけた！`);
    } else {
      const dmg = _calcDamage(Math.floor(enemy.atk * atkMult), player.def);
      _applyPlayerDamage(dmg, `${enemy.name}の　こうげき！\nでこやまは　${dmg}の　ダメージをうけた！`);
    }
  }

  function _applyPlayerDamage(dmg, msg) {
    Sound.hit();
    Game.takeDamage(dmg);
    const enemy = bstate.enemy;
    // 毒判定（40%の確率）
    if (enemy.poison && !Game.isPoisoned() && Math.random() < 0.4) {
      Game.setPoison(true);
      UI.showMessage(msg, () => {
        Sound.poison();
        UI.showMessage('どくに　おかされた！', () => {
          if (Game.getPlayer().hp <= 0) _playerDead();
          else _waitCommand();
        });
      });
      return;
    }
    UI.showMessage(msg, () => {
      if (Game.getPlayer().hp <= 0) _playerDead();
      else _waitCommand();
    });
  }

  // ── 敵撃破 ────────────────────────────────────────────────
  function _enemyDead() {
    const enemy = bstate.enemy;
    Sound.victory();
    let msg = `${enemy.name}を　たおした！\n${enemy.exp}の　けいけんちと\n${enemy.gold}ゴールドをてにいれた！`;
    if (enemy.dropItem) {
      Game.addItem(enemy.dropItem);
      msg += `\n${GameData.ITEMS[enemy.dropItem].name}をてにいれた！`;
    }
    UI.showMessage(msg, () => {
      const gains = Game.gainExp(enemy.exp);
      Game.gainGold(enemy.gold);
      // 魔王は真の魔王戦が残るかもしれないので、ここではクリアしない
      if (bstate.bossId && bstate.bossId !== 'maou') MapEngine.setBossCleared(bstate.bossId);
      if (gains) {
        const lv = Game.getPlayer().level;
        const newSpell = _checkNewSpell(lv);
        Sound.levelUp();
        let lvMsg = `レベルが　あがった！\nレベル ${lv}に　なった！\n`;
        lvMsg += `HP+${gains.hpGain}　MP+${gains.mpGain}\n`;
        lvMsg += `こうげき+${gains.atkGain}　まもり+${gains.defGain}`;
        if (newSpell) { Game.learnSpell(newSpell); lvMsg += `\n${GameData.SPELLS[newSpell].name}を　おぼえた！`; }
        UI.showMessage(lvMsg, () => _endBattle(true));
      } else {
        _endBattle(true);
      }
    });
  }

  // ── プレイヤー死亡 ────────────────────────────────────────
  function _playerDead() {
    // エリクサー自動使用（50%の確率）
    const player = Game.getPlayer();
    if (player.items.includes('elixir') && Math.random() < 0.5) {
      Game.removeItem('elixir');
      Game.healHp(9999);
      Game.healMp(9999);
      Sound.heal();
      UI.showMessage('しかし　ふところの\nエリクサーが　かがやき\nでこやまは　ふっかつした！', () => {
        _waitCommand();
      });
      return;
    }

    bstate.active = false;
    UI.showBattleMenu(false);
    Sound.death();
    // 真の魔王戦 or 魔王戦での死亡→城に戻す
    if (bstate.bossId === 'maou') {
      Game.setLostToMaou();
      if (bstate.trueMaou) Game.addTrueMaouDefeat();
      UI.showMessage('でこやまは　しんでしまった…', () => {
        _hideBattleScreen();
        Game.revive();
        MapEngine.loadMap('throne_room', 5, 5);
        MapEngine.setMoveLock(false);
        setTimeout(() => {
          const hasKingSword = Game.getPlayer().weapon === 'kings_sword';
          if (bstate.trueMaou && !hasKingSword) {
            UI.showNpcDialog([
              'おお　でこやまよ。\nまおうは　しんの　ちからを\nみせたか…。',
              'おうさまに　はなしかけよ。\nでんせつの　けんが\nちからを　かしてくれるだろう。',
            ]);
          } else {
            UI.showNpcDialog([
              'おお　でこやまよ。\nしんで　しまうとは\nなさけない',
              'かねは　はんぶん\nもらってゆく\nじょほほ',
            ]);
          }
        }, 300);
      });
      return;
    }
    UI.showMessage('でこやまは　しんでしまった…', () => {
      _hideBattleScreen();
      Game.revive();
      MapEngine.loadMap('throne_room', 5, 5);
      MapEngine.setMoveLock(false);
      // 王の台詞を表示（金が半分になる）
      setTimeout(() => {
        UI.showNpcDialog([
          'おお　でこやまよ。\nしんで　しまうとは\nなさけない',
          'かねは　はんぶん\nもらってゆく\nじょほほ',
        ]);
      }, 300);
    });
  }

  // ── 戦闘終了 ─────────────────────────────────────────────
  function _endBattle(won) {
    bstate.active = false;
    UI.showBattleMenu(false);

    // 真の魔王：Lv10で魔王撃破時、全回復してパワーアップ再戦
    if (won && bstate.bossId === 'maou' && Game.getPlayer().level >= 10 && !bstate.trueMaou) {
      bstate.trueMaou = true;
      UI.showMessage('まおう:ふふふ…\nなかなか　やるではないか…', () => {
        UI.showMessage('しかし　これが\nわしの　しんの　ちからだ！！', () => {
          Sound.bossEncounter();
          // 真の魔王ステータス
          bstate.active = true;
          bstate.enemy = {
            ...bstate.enemy,
            id:'true_maou',
            name:'しんのまおう',
            color:'#880000',
            hp:550, atk:140, def:48,
            spells:['bagi','behoimi'],
            phase2Hp:250,
          };
          bstate.enemyHp    = 550;
          bstate.enemyMaxHp = 550;
          bstate.enemyMp    = 21; // ベホイミ3回分(7×3)
          bstate.phase2     = false;
          _updateHpBar(450, 450);
          _showBattleScreen(bstate.enemy);
          UI.showMessage('しんのまおうが\nすがたを　あらわした！！', () => _waitCommand());
        });
      });
      return;
    }

    _hideBattleScreen();
    MapEngine.setMoveLock(false);
    if (won && bstate.bossId === 'maou') {
      MapEngine.setBossCleared('maou');
      setTimeout(() => Game.startEnding(), 500);
    } else {
      UI.clearMessage();
      MapEngine.render();
    }
  }

  // ── ダメージ計算 ─────────────────────────────────────────
  function _calcDamage(atk, def) {
    const base = Math.max(1, atk - def);
    const vary = Math.floor(base * 0.25);
    return Math.max(1, base - vary + Math.floor(Math.random() * (vary * 2 + 1)));
  }
  function _rand(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  function _checkNewSpell(lv) {
    for (const [id, sp] of Object.entries(GameData.SPELLS)) {
      if (sp.learnLv === lv && !Game.getPlayer().spells.includes(id)) return id;
    }
    return null;
  }

  return {
    start,
    execCommand,
    execSpell,
    execItem,
    isActive     : () => bstate.active,
    getEnemyHp   : () => bstate.enemyHp,
    getEnemy     : () => bstate.enemy,
    isWaitingCmd : () => bstate.waitingCmd,
  };

})();
