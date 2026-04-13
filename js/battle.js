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

    // 敵の色
    const col  = enemy.color || '#884488';
    const col2 = _darken(col, 0.6);

    if (enemy.isBoss) {
      _drawBossSprite(ctx, W, H, col, col2, enemy);
    } else {
      _drawNormalSprite(ctx, W, H, col, col2, enemy);
    }
  }

  function _drawNormalSprite(ctx, W, H, col, col2, enemy) {
    const cx = W / 2;
    const cy = H * 0.5;
    const r  = Math.min(W, H) * 0.28;

    // 体（丸）
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // ハイライト
    ctx.fillStyle = _lighten(col, 1.4);
    ctx.beginPath();
    ctx.ellipse(cx - r*0.25, cy - r*0.3, r*0.35, r*0.25, -0.3, 0, Math.PI*2);
    ctx.fill();
    // 目
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(cx-r*0.3, cy-r*0.1, r*0.18, r*0.2, 0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+r*0.3, cy-r*0.1, r*0.18, r*0.2, 0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(cx-r*0.28, cy-r*0.1, r*0.1, r*0.12,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+r*0.32, cy-r*0.1, r*0.1, r*0.12,0,0,Math.PI*2); ctx.fill();
    // 口
    ctx.strokeStyle = col2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + r*0.25, r*0.2, 0.1, Math.PI - 0.1);
    ctx.stroke();
    // 触手・足
    for (let i = 0; i < 3; i++) {
      const ox = cx + (i - 1) * r * 0.55;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(ox, cy + r * 1.05, r*0.12, r*0.22, (i-1)*0.2, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function _drawBossSprite(ctx, W, H, col, col2, enemy) {
    const cx = W / 2;
    const cy = H * 0.48;
    const r  = Math.min(W, H) * 0.34;

    // 体
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    // 外殻
    ctx.strokeStyle = col2;
    ctx.lineWidth = 3;
    ctx.stroke();
    // ハイライト
    ctx.fillStyle = _lighten(col, 1.35);
    ctx.beginPath();
    ctx.ellipse(cx - r*0.22, cy - r*0.28, r*0.3, r*0.22, -0.4, 0, Math.PI*2);
    ctx.fill();
    // 角（2本）
    ctx.fillStyle = col2;
    [[cx-r*0.35, cy-r, -0.3],[cx+r*0.35, cy-r, 0.3]].forEach(([hx,hy,rot])=>{
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r*0.15, -r*0.45);
      ctx.lineTo(r*0.15, -r*0.45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    // 目（怒り目）
    ctx.fillStyle = '#ffee00';
    ctx.beginPath(); ctx.ellipse(cx-r*0.32,cy-r*0.15, r*0.2, r*0.14,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+r*0.32,cy-r*0.15, r*0.2, r*0.14,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#cc0000';
    ctx.beginPath(); ctx.ellipse(cx-r*0.3, cy-r*0.15, r*0.11, r*0.11,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+r*0.32,cy-r*0.15, r*0.11, r*0.11,0,0,Math.PI*2); ctx.fill();
    // 眉（怒り）
    ctx.strokeStyle = col2;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx-r*0.5, cy-r*0.32); ctx.lineTo(cx-r*0.15, cy-r*0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+r*0.5, cy-r*0.32); ctx.lineTo(cx+r*0.15, cy-r*0.25); ctx.stroke();
    // 口（牙あり）
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(cx - r*0.35, cy + r*0.2);
    ctx.quadraticCurveTo(cx, cy + r*0.55, cx + r*0.35, cy + r*0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(cx-r*0.2,cy+r*0.2); ctx.lineTo(cx-r*0.12,cy+r*0.38); ctx.lineTo(cx-r*0.04,cy+r*0.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx+r*0.04,cy+r*0.2); ctx.lineTo(cx+r*0.12,cy+r*0.38); ctx.lineTo(cx+r*0.2,cy+r*0.2); ctx.fill();
    // 腕
    ctx.fillStyle = col;
    [[-1,1],[1,1]].forEach(([sx,sy])=>{
      ctx.beginPath();
      ctx.ellipse(cx+sx*r*1.05, cy+sy*r*0.1, r*0.18, r*0.3, sx*0.4, 0, Math.PI*2);
      ctx.fill();
    });
  }

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

    MapEngine.setMoveLock(true);
    _showBattleScreen(bstate.enemy);

    const msg = isBoss
      ? `${enemyDef.name}が\nあらわれた！`
      : `${enemyDef.name}に\nであった！`;

    UI.showMessage(msg, () => _waitCommand());
  }

  // ── コマンド入力待ち ──────────────────────────────────────
  function _waitCommand() {
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
    const dmg = _calcDamage(player.atk + atkBonus, enemy.def);
    bstate.enemyHp -= dmg;
    _updateHpBar(bstate.enemyHp, bstate.enemyMaxHp);

    UI.showMessage(`でこやまの　こうげき！\n${enemy.name}に　${dmg}の　ダメージ！`, () => {
      if (bstate.enemyHp <= 0) {
        _enemyDead();
      } else if (bstate.isBoss && enemy.phase2Hp && bstate.enemyHp <= enemy.phase2Hp && !bstate.phase2) {
        bstate.phase2 = true;
        UI.showMessage(`${enemy.name}は　まだ　たたかう\nちからが　のこっている！`, () => _enemyTurn());
      } else {
        _enemyTurn();
      }
    });
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
      const heal = _rand(spell.power[0], spell.power[1]);
      Game.healHp(heal);
      UI.showMessage(`${spell.name}！\nでこやまの　HPが　${heal}　かいふくした！`, () => _enemyTurn());
    } else if (spell.type === 'attack') {
      const dmg = _rand(spell.power[0], spell.power[1]);
      bstate.enemyHp -= dmg;
      _updateHpBar(bstate.enemyHp, bstate.enemyMaxHp);
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
      UI.showMessage(`${item.name}をつかった！\nHPが　${item.power}　かいふくした！`, () => _enemyTurn());
    } else if (item.effect === 'mp_heal') {
      Game.removeItem(itemId);
      Game.healMp(item.power);
      UI.showMessage(`${item.name}をつかった！\nMPが　${item.power}　かいふくした！`, () => _enemyTurn());
    } else if (item.effect === 'cure_poison') {
      Game.removeItem(itemId);
      UI.showMessage(`${item.name}をつかった！\nどくが　なおった！`, () => _enemyTurn());
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
      UI.showMessage('うまく　にげきれた！', () => _endBattle(false));
    } else {
      UI.showMessage('しかし　まわりこまれた！', () => _enemyTurn());
    }
  }

  // ── 敵のターン ────────────────────────────────────────────
  function _enemyTurn() {
    if (!bstate.active) return;
    const enemy  = bstate.enemy;
    const player = Game.getPlayer();
    if (enemy.spells && enemy.spells.length > 0 && Math.random() < 0.3) {
      const spellId = enemy.spells[Math.floor(Math.random() * enemy.spells.length)];
      const spell   = GameData.SPELLS[spellId];
      if (spell.type === 'attack') {
        const dmg = _rand(spell.power[0], spell.power[1]);
        _applyPlayerDamage(dmg, `${enemy.name}は　${spell.name}をとなえた！\nでこやまは　${dmg}の　ダメージをうけた！`);
        return;
      }
    }
    const atkMult = bstate.phase2 ? 1.3 : 1.0;
    const dmg = _calcDamage(Math.floor(enemy.atk * atkMult), player.def);
    _applyPlayerDamage(dmg, `${enemy.name}の　こうげき！\nでこやまは　${dmg}の　ダメージをうけた！`);
  }

  function _applyPlayerDamage(dmg, msg) {
    Game.takeDamage(dmg);
    UI.showMessage(msg, () => {
      if (Game.getPlayer().hp <= 0) _playerDead();
      else _waitCommand();
    });
  }

  // ── 敵撃破 ────────────────────────────────────────────────
  function _enemyDead() {
    const enemy = bstate.enemy;
    let msg = `${enemy.name}を　たおした！\n${enemy.exp}の　けいけんちと\n${enemy.gold}ゴールドをてにいれた！`;
    if (enemy.dropItem) {
      Game.addItem(enemy.dropItem);
      msg += `\n${GameData.ITEMS[enemy.dropItem].name}をてにいれた！`;
    }
    UI.showMessage(msg, () => {
      const gains = Game.gainExp(enemy.exp);
      Game.gainGold(enemy.gold);
      if (bstate.bossId) MapEngine.setBossCleared(bstate.bossId);
      if (gains) {
        const lv = Game.getPlayer().level;
        const newSpell = _checkNewSpell(lv);
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
    bstate.active = false;
    UI.showBattleMenu(false);
    UI.showMessage('でこやまは　しんでしまった…\n\nおうさまのもとへ\nもどされた。', () => {
      _hideBattleScreen();
      Game.revive();
      MapEngine.loadMap('castle_town', 7, 13);
      MapEngine.setMoveLock(false);
      UI.clearMessage();
    });
  }

  // ── 戦闘終了 ─────────────────────────────────────────────
  function _endBattle(won) {
    bstate.active = false;
    UI.showBattleMenu(false);
    _hideBattleScreen();
    MapEngine.setMoveLock(false);
    if (won && bstate.bossId === 'maou') {
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
