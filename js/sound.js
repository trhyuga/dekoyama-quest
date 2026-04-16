// ============================================================
//  sound.js — でこやまクエスト サウンドエンジン
//  Web Audio API でチップチューン風SE・ファンファーレを生成
// ============================================================

const Sound = (() => {

  let ctx = null;
  let _muted = false;

  function _getCtx() {
    if (_muted) return null;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setMuted(v) { _muted = v; }

  // ── 基本波形再生 ─────────────────────────────────────────
  function _tone(freq, dur, type, vol, startTime) {
    const c = _getCtx();
    if (!c) return;
    const t = startTime || c.currentTime;
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol || 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  // ── ノイズ（打撃・爆発用） ──────────────────────────────
  function _noise(dur, vol, startTime) {
    const c = _getCtx();
    if (!c) return;
    const t = startTime || c.currentTime;
    const bufSize = c.sampleRate * dur;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src  = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol || 0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(gain);
    gain.connect(c.destination);
    src.start(t);
    src.stop(t + dur);
  }

  // ══════════════════════════════════════════════════════════
  //  効果音
  // ══════════════════════════════════════════════════════════

  // ── カーソル・メニュー選択 ────────────────────────────────
  function cursor() {
    _tone(880, 0.06, 'square', 0.08);
  }

  // ── 戦闘エンカウント ─────────────────────────────────────
  function encounter() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(220, 0.12, 'square', 0.15, t);
    _tone(280, 0.12, 'square', 0.15, t + 0.08);
    _tone(350, 0.12, 'square', 0.15, t + 0.16);
    _tone(440, 0.25, 'square', 0.18, t + 0.24);
  }

  // ── ボスエンカウント ─────────────────────────────────────
  function bossEncounter() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(110, 0.2, 'sawtooth', 0.18, t);
    _tone(130, 0.2, 'sawtooth', 0.18, t + 0.15);
    _tone(110, 0.2, 'sawtooth', 0.18, t + 0.3);
    _tone(165, 0.4, 'sawtooth', 0.2, t + 0.45);
    _noise(0.3, 0.06, t + 0.1);
  }

  // ── プレイヤー攻撃（斬撃） ──────────────────────────────
  function attack() {
    const c = _getCtx();
    const t = c.currentTime;
    _noise(0.08, 0.15, t);
    _tone(800, 0.05, 'square', 0.1, t);
    _tone(400, 0.08, 'square', 0.08, t + 0.04);
  }

  // ── 敵の攻撃（被ダメ） ──────────────────────────────────
  function hit() {
    const c = _getCtx();
    const t = c.currentTime;
    _noise(0.12, 0.12, t);
    _tone(200, 0.1, 'square', 0.1, t + 0.02);
    _tone(120, 0.15, 'square', 0.08, t + 0.08);
  }

  // ── 攻撃魔法 ────────────────────────────────────────────
  function magicAttack() {
    const c = _getCtx();
    const t = c.currentTime;
    for (let i = 0; i < 6; i++) {
      _tone(600 + i * 100, 0.08, 'sine', 0.1, t + i * 0.05);
    }
    _noise(0.15, 0.08, t + 0.2);
  }

  // ── 回復魔法・回復アイテム ──────────────────────────────
  function heal() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(523, 0.15, 'sine', 0.12, t);
    _tone(659, 0.15, 'sine', 0.12, t + 0.12);
    _tone(784, 0.15, 'sine', 0.12, t + 0.24);
    _tone(1047, 0.25, 'sine', 0.1, t + 0.36);
  }

  // ── 毒を受けた ──────────────────────────────────────────
  function poison() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(300, 0.15, 'sawtooth', 0.1, t);
    _tone(250, 0.15, 'sawtooth', 0.1, t + 0.12);
    _tone(200, 0.2, 'sawtooth', 0.1, t + 0.24);
  }

  // ── 毒ダメージ（ジリジリ） ──────────────────────────────
  function poisonTick() {
    _tone(180, 0.12, 'sawtooth', 0.06);
    _tone(160, 0.12, 'sawtooth', 0.06);
  }

  // ── 毒回復 ──────────────────────────────────────────────
  function curePoison() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(400, 0.12, 'sine', 0.1, t);
    _tone(600, 0.12, 'sine', 0.1, t + 0.1);
    _tone(800, 0.2, 'sine', 0.12, t + 0.2);
  }

  // ── 勝利ファンファーレ ──────────────────────────────────
  function victory() {
    const c = _getCtx();
    const t = c.currentTime;
    const notes = [523, 523, 523, 698, 784, 698, 784, 1047];
    const durs  = [0.1, 0.1, 0.15, 0.15, 0.12, 0.12, 0.15, 0.4];
    let off = 0;
    for (let i = 0; i < notes.length; i++) {
      _tone(notes[i], durs[i] + 0.05, 'square', 0.13, t + off);
      off += durs[i];
    }
  }

  // ── レベルアップ ─────────────────────────────────────────
  function levelUp() {
    const c = _getCtx();
    const t = c.currentTime;
    const notes = [523, 659, 784, 1047, 1319, 1568];
    for (let i = 0; i < notes.length; i++) {
      _tone(notes[i], 0.18, 'square', 0.12, t + i * 0.1);
    }
  }

  // ── プレイヤー死亡 ──────────────────────────────────────
  function death() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(440, 0.25, 'square', 0.12, t);
    _tone(370, 0.25, 'square', 0.12, t + 0.22);
    _tone(311, 0.25, 'square', 0.12, t + 0.44);
    _tone(261, 0.5, 'square', 0.12, t + 0.66);
  }

  // ── 宝箱 ────────────────────────────────────────────────
  function chest() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(784, 0.1, 'square', 0.12, t);
    _tone(988, 0.1, 'square', 0.12, t + 0.1);
    _tone(1175, 0.1, 'square', 0.12, t + 0.2);
    _tone(1568, 0.3, 'square', 0.14, t + 0.3);
  }

  // ── 買い物 ──────────────────────────────────────────────
  function buy() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(1200, 0.06, 'square', 0.08, t);
    _tone(1500, 0.06, 'square', 0.08, t + 0.06);
    _tone(1800, 0.1, 'square', 0.1, t + 0.12);
  }

  // ── 宿屋 ────────────────────────────────────────────────
  function inn() {
    const c = _getCtx();
    const t = c.currentTime;
    const notes = [523, 659, 784, 659, 523];
    for (let i = 0; i < notes.length; i++) {
      _tone(notes[i], 0.25, 'sine', 0.1, t + i * 0.22);
    }
  }

  // ── マップ移動 ──────────────────────────────────────────
  function teleport() {
    const c = _getCtx();
    const t = c.currentTime;
    for (let i = 0; i < 4; i++) {
      _tone(400 + i * 200, 0.08, 'sine', 0.08, t + i * 0.05);
    }
  }

  // ── タイトル画面 ─────────────────────────────────────────
  function title() {
    const c = _getCtx();
    const t = c.currentTime;
    const notes = [392, 494, 587, 784];
    for (let i = 0; i < notes.length; i++) {
      _tone(notes[i], 0.3, 'square', 0.1, t + i * 0.2);
    }
  }

  // ── エンディングファンファーレ ──────────────────────────
  function ending() {
    const c = _getCtx();
    const t = c.currentTime;
    const notes = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
    const durs  = [0.2, 0.2, 0.2, 0.25, 0.15, 0.2, 0.2, 0.6];
    let off = 0;
    for (let i = 0; i < notes.length; i++) {
      _tone(notes[i], durs[i] + 0.08, 'square', 0.13, t + off);
      off += durs[i];
    }
  }

  // ── かいしんのいちげき ───────────────────────────────────
  function critical() {
    const c = _getCtx();
    const t = c.currentTime;
    _noise(0.06, 0.15, t);
    _tone(800, 0.06, 'square', 0.15, t);
    _tone(1200, 0.06, 'square', 0.15, t + 0.05);
    _tone(1600, 0.1, 'square', 0.18, t + 0.1);
    _noise(0.1, 0.12, t + 0.12);
    _tone(2000, 0.15, 'square', 0.12, t + 0.15);
  }

  // ── つうこんのいちげき ──────────────────────────────────
  function enemyCritical() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(300, 0.08, 'sawtooth', 0.18, t);
    _noise(0.15, 0.18, t + 0.05);
    _tone(150, 0.12, 'sawtooth', 0.2, t + 0.1);
    _noise(0.2, 0.15, t + 0.15);
    _tone(80, 0.25, 'sawtooth', 0.15, t + 0.2);
  }

  // ── 逃げる失敗 ──────────────────────────────────────────
  function runFail() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(400, 0.1, 'square', 0.08, t);
    _tone(300, 0.15, 'square', 0.08, t + 0.1);
  }

  // ── 逃げる成功 ──────────────────────────────────────────
  function runOk() {
    const c = _getCtx();
    const t = c.currentTime;
    _tone(600, 0.08, 'square', 0.08, t);
    _tone(800, 0.08, 'square', 0.08, t + 0.06);
    _tone(1000, 0.1, 'square', 0.1, t + 0.12);
  }

  return {
    cursor, encounter, bossEncounter,
    attack, hit, critical, enemyCritical,
    magicAttack, heal,
    poison, poisonTick, curePoison,
    victory, levelUp, death,
    chest, buy, inn, teleport,
    title, ending, setMuted,
    runFail, runOk,
  };

})();
