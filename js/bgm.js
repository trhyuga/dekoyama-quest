// ============================================================
//  bgm.js — でこやまクエスト BGM管理
//  MP3ファイルの再生・停止・切り替えを管理
// ============================================================

const BGM = (() => {

  let current = null;
  let currentId = null;
  let volume = 0.4;
  let muted = false;

  const tracks = {
    title:     'audio/タイトル画面.mp3',
    field:     'audio/フィールド画面.mp3',
    castle_town: 'audio/城下町.mp3',
    throne:    'audio/王城.mp3',
    desert_town: 'audio/荒野の町.mp3',
    dungeon1:  'audio/草の洞窟.mp3',
    dungeon2:  'audio/魔の塔.mp3',
    maou_castle: 'audio/魔王城.mp3',
    battle:    'audio/バトル.mp3',
    boss:      'audio/中ボスバトル.mp3',
    maou:      'audio/魔王戦.mp3',
    ending:    'audio/エンディング.mp3',
  };

  function play(id) {
    if (currentId === id && current && !current.paused) return; // 同じ曲なら何もしない
    stop();
    const src = tracks[id];
    if (!src) return;
    currentId = id;
    current = new Audio(src);
    current.loop = true;
    current.volume = muted ? 0 : volume;
    current.play().catch(() => {});
  }

  function playOnce(id) {
    stop();
    const src = tracks[id];
    if (!src) return;
    currentId = id;
    current = new Audio(src);
    current.loop = false;
    current.volume = muted ? 0 : volume;
    current.play().catch(() => {});
  }

  function stop() {
    if (current) {
      current.pause();
      current.currentTime = 0;
      current = null;
      currentId = null;
    }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (current) current.volume = muted ? 0 : volume;
  }

  function toggleMute() {
    muted = !muted;
    if (current) current.volume = muted ? 0 : volume;
    return muted;
  }

  function isMuted() { return muted; }

  function getCurrentId() {
    return currentId;
  }

  return { play, playOnce, stop, setVolume, getCurrentId, toggleMute, isMuted };

})();
