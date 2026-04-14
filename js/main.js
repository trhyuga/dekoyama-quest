// ============================================================
//  main.js — でこやまクエスト メインコントローラ
//  シーン管理・プレイヤー状態・ゲーム進行全般
// ============================================================

// ── プレイヤーの初期状態 ────────────────────────────────────
const PLAYER_INIT = () => ({
  name   : 'でこやま',
  level  : 1,
  exp    : 0,
  gold   : 0,
  hp     : 15,
  maxHp  : 15,
  mp     : 8,
  maxMp  : 8,
  atk    : 8,
  def    : 5,
  weapon : null,
  armor  : null,
  shield : null,
  spells : [],
  items  : ['herb','herb'], // 初期アイテム
  poisoned: false,
});

// ── ゲームグローバル状態 ─────────────────────────────────────
const Game = (() => {

  let player = PLAYER_INIT();
  let _kingGoldGiven = false;

  // ── 初期化 ────────────────────────────────────────────────
  function init() {
    // dvhが使えないブラウザ向けフォールバック：window.innerHeightをCSSカスタム変数でセット
    function _setVh() {
      const vh = window.innerHeight;
      document.getElementById('game-wrapper').style.height = Math.min(vh, 854) + 'px';
    }
    _setVh();
    window.addEventListener('resize', _setVh);

    // メニューボタン
    const menuBtn = document.getElementById('status-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.showGameMenu();
      });
    }

    UI.init();
    MapEngine.init(document.getElementById('map-canvas'));
    _showTitle();
  }

  // ── タイトル画面 ──────────────────────────────────────────
  function _showTitle() {
    Sound.title();
    UI.showScene('title');

    // 画面のどこをタップしてもゲーム開始
    const sceneEl = document.getElementById('scene-title');
    function onStart() {
      sceneEl.removeEventListener('click',      onStart);
      sceneEl.removeEventListener('touchstart', onStartTouch);
      player = PLAYER_INIT();
      _kingGoldGiven = false;
      _startOpening();
    }
    function onStartTouch(e) {
      e.preventDefault();
      onStart();
    }
    sceneEl.addEventListener('click',      onStart);
    sceneEl.addEventListener('touchstart', onStartTouch, { passive: false });
  }

  // ── オープニング ──────────────────────────────────────────
  function _startOpening() {
    UI.showOpening(GameData.OPENING_LINES, () => {
      // オープニング終了→王の間へ
      // 先にシーンを表示してからレイアウト計算が完了するのを待つ（50ms）
      UI.showScene('game');
      UI.updateStatus(player);
      setTimeout(() => {
        MapEngine.resize();
        MapEngine.loadMap('throne_room', 4, 8);
        UI.showMessage('おうさまに　はなしかけてみよう。', null);
      }, 50);
    });
  }

  // ── エンディング ──────────────────────────────────────────
  function startEnding() {
    MapEngine.setMoveLock(true);
    Sound.ending();
    UI.showEnding(GameData.ENDING_LINES, () => {
      // エンディング終了→タイトルに戻る
      setTimeout(() => {
        player = PLAYER_INIT();
        _showTitle();
      }, 3000);
    });
  }

  // ── 宿屋 ─────────────────────────────────────────────────
  function useInn(cost) {
    UI.showInnDialog(cost,
      // YES
      () => {
        if (player.gold < cost) {
          UI.showMessage('おかねが　たりない！', null);
          return;
        }
        player.gold -= cost;
        player.hp   = player.maxHp;
        player.mp   = player.maxMp;
        player.poisoned = false;
        UI.updateStatus(player);
        Sound.inn();
        UI.showMessage(
          'ゆっくり　やすんだ。\nHPと　MPが　かいふくした！',
          null
        );
      },
      // NO
      () => {
        UI.showMessage('またきてね！', null);
      }
    );
  }

  // ── ショップ ─────────────────────────────────────────────
  function openShop(shopId) {
    UI.showShop(shopId);
  }

  // ── アイテム購入 ──────────────────────────────────────────
  function buyItem(itemId) {
    const item = GameData.ITEMS[itemId];
    if (player.gold < item.price) return;
    player.gold -= item.price;

    if (item.type === 'weapon') {
      // 装備変更
      if (player.weapon) player.items.push(player.weapon); // 旧装備を持ち物へ
      player.weapon  = itemId;
      player.atk     = _calcAtk();
    } else if (item.type === 'armor') {
      if (player.armor) player.items.push(player.armor);
      player.armor = itemId;
      player.def   = _calcDef();
    } else if (item.type === 'shield') {
      if (player.shield) player.items.push(player.shield);
      player.shield = itemId;
      player.def    = _calcDef();
    } else {
      player.items.push(itemId);
    }
    UI.updateStatus(player);
  }

  function _calcAtk() {
    const base = GameData.LEVEL_TABLE[player.level].atk;
    const wBonus = player.weapon ? (GameData.ITEMS[player.weapon].atk || 0) : 0;
    return base + wBonus;
  }

  function _calcDef() {
    const base = GameData.LEVEL_TABLE[player.level].def;
    const aBonus = player.armor  ? (GameData.ITEMS[player.armor].def  || 0) : 0;
    const sBonus = player.shield ? (GameData.ITEMS[player.shield].def || 0) : 0;
    return base + aBonus + sBonus;
  }

  // ── アイテム追加・削除 ────────────────────────────────────
  function addItem(itemId) {
    const item = GameData.ITEMS[itemId];
    if (!item) return;
    if (item.type === 'weapon') {
      if (player.weapon) player.items.push(player.weapon); // 旧装備をバッグへ
      player.weapon = itemId;
      player.atk    = _calcAtk();
    } else if (item.type === 'armor') {
      if (player.armor) player.items.push(player.armor);
      player.armor = itemId;
      player.def    = _calcDef();
    } else if (item.type === 'shield') {
      if (player.shield) player.items.push(player.shield);
      player.shield = itemId;
      player.def    = _calcDef();
    } else {
      player.items.push(itemId);
    }
    UI.updateStatus(player);
  }

  function removeItem(itemId) {
    const idx = player.items.indexOf(itemId);
    if (idx !== -1) player.items.splice(idx, 1);
  }

  // ── 戦闘系 ────────────────────────────────────────────────
  function takeDamage(dmg) {
    player.hp = Math.max(0, player.hp - dmg);
    UI.updateStatus(player);
  }

  function healHp(amount) {
    player.hp = Math.min(player.maxHp, player.hp + amount);
    UI.updateStatus(player);
  }

  function healMp(amount) {
    player.mp = Math.min(player.maxMp, player.mp + amount);
    UI.updateStatus(player);
  }

  function useMp(amount) {
    player.mp = Math.max(0, player.mp - amount);
    UI.updateStatus(player);
  }

  function gainGold(amount) {
    player.gold += amount;
    UI.updateStatus(player);
  }

  function gainExp(amount) {
    player.exp += amount;
    const lv = player.level;
    if (lv >= GameData.LEVEL_TABLE.length - 1) return null;
    const next = GameData.LEVEL_TABLE[lv + 1];
    if (player.exp >= next.exp) {
      player.level++;
      return _applyLevelStats(); // 上昇値オブジェクトを返す
    }
    return null;
  }

  function _applyLevelStats() {
    const tbl      = GameData.LEVEL_TABLE[player.level];
    const oldMaxHp = player.maxHp;
    const oldMaxMp = player.maxMp;
    const oldAtk   = player.atk;
    const oldDef   = player.def;
    player.maxHp   = tbl.hp;
    player.maxMp   = tbl.mp;
    player.hp      = Math.min(player.maxHp, player.hp + (tbl.hp - oldMaxHp));
    player.mp      = Math.min(player.maxMp, player.mp + (tbl.mp - oldMaxMp));
    player.atk     = _calcAtk();
    player.def     = _calcDef();
    UI.updateStatus(player);
    return {
      hpGain  : player.maxHp - oldMaxHp,
      mpGain  : player.maxMp - oldMaxMp,
      atkGain : player.atk   - oldAtk,
      defGain : player.def   - oldDef,
    };
  }

  function learnSpell(spellId) {
    if (!player.spells.includes(spellId)) {
      player.spells.push(spellId);
    }
  }

  function getKingDialog() {
    if (!_kingGoldGiven) {
      _kingGoldGiven = true;
      return {
        lines: GameData.NPC.king,
        onClose: () => {
          player.gold += 50;
          UI.updateStatus(player);
          UI.showMessage('おうさまから　５０Ｇを　もらった！', null);
        }
      };
    }
    // 2回目以降
    if (MapEngine.isBossCleared('dungeon2_boss')) {
      return { lines: GameData.NPC.king_after_d2, onClose: null };
    } else if (MapEngine.isBossCleared('dungeon1_boss')) {
      return { lines: GameData.NPC.king_after_d1, onClose: null };
    } else {
      return {
        lines: ['まおうを　たおし\nひめをたすけよ！\nでこやまよ！'],
        onClose: null
      };
    }
  }

  function revive() {
    // 復活：HP/MP全回復・金半減
    player.hp   = player.maxHp;
    player.mp   = player.maxMp;
    player.gold = Math.floor(player.gold / 2);
    UI.updateStatus(player);
  }

  // ── セーブ・ロード ────────────────────────────────────────
  function saveGame() {
    const data = {
      version: 1,
      player: JSON.parse(JSON.stringify(player)),
      map:    MapEngine.getMapState(),
      flags:  { kingGoldGiven: _kingGoldGiven },
    };
    try {
      localStorage.setItem('dekoyama_save', JSON.stringify(data));
      return true;
    } catch(e) {
      return false;
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem('dekoyama_save');
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return false;
      player         = data.player;
      _kingGoldGiven = data.flags ? data.flags.kingGoldGiven : false;
      UI.updateStatus(player);
      UI.showScene('game');
      setTimeout(() => {
        MapEngine.setMapState(data.map);
      }, 50);
      return true;
    } catch(e) {
      return false;
    }
  }

  function hasSaveData() {
    return !!localStorage.getItem('dekoyama_save');
  }

  function setPoison(v) { player.poisoned = !!v; UI.updateStatus(player); }
  function isPoisoned() { return !!player.poisoned; }

  function getPlayer() { return player; }

  // ── エントリーポイント ────────────────────────────────────
  window.addEventListener('DOMContentLoaded', init);

  return {
    getPlayer,
    addItem,
    removeItem,
    buyItem,
    takeDamage,
    healHp,
    healMp,
    useMp,
    gainGold,
    gainExp,
    learnSpell,
    revive,
    useInn,
    openShop,
    startEnding,
    getKingDialog,
    saveGame,
    loadGame,
    hasSaveData,
    setPoison,
    isPoisoned,
  };

})();
