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
  let _kingGoldGiven    = false;
  let _queenItemGiven   = false;
  let _spellPowerDoubled = false;
  let _deathCount       = 0;
  let _trueMaouDefeats  = 0;  // 真の魔王に負けた回数
  let _defSeedGiven     = 0;  // まもりのたねをもらった回数
  let _healBoosted      = false; // 回復魔法強化済み
  let _queenElixirGiven = false;
  let _atkSeedGiven     = 0;   // 力のタネをもらった回数
  let _kingSwordGiven   = false;
  let _lostToMaou       = false;
  let _firstItemShop    = true;
  let _firstWeaponShop  = true;
  let _firstInn         = true;
  let _isNewGamePlus    = false;
  let _ngPlusStats      = null; // { maxHp, maxMp, atk, def, gold }

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

    // メニューテキスト変更
    const menuEl = document.getElementById('menu-start');
    if (menuEl) {
      menuEl.innerHTML = _isNewGamePlus
        ? '<span class="cursor">▶</span>つよくてにゅーげーむ'
        : '<span class="cursor">▶</span>ぼうけんをはじめる';
    }

    // タイトル画面アニメーション起動
    setTimeout(() => {
      if (typeof TitleScreen !== 'undefined') TitleScreen.init();
    }, 30);

    // 画面のどこをタップしてもゲーム開始
    const sceneEl = document.getElementById('scene-title');
    function onStart() {
      if (typeof TitleScreen !== 'undefined') TitleScreen.stop();
      sceneEl.removeEventListener('click',      onStart);
      sceneEl.removeEventListener('touchstart', onStartTouch);
      player = PLAYER_INIT();
      // NG+: ステータス引き継ぎ
      if (_isNewGamePlus && _ngPlusStats) {
        player.maxHp = _ngPlusStats.maxHp;
        player.hp    = _ngPlusStats.maxHp;
        player.maxMp = _ngPlusStats.maxMp;
        player.mp    = _ngPlusStats.maxMp;
        player.atk   = _ngPlusStats.atk;
        player.def   = _ngPlusStats.def;
        player.gold  = _ngPlusStats.gold;
      }
      _kingGoldGiven     = false;
      _queenItemGiven    = false;
      _spellPowerDoubled = false;
      _slimeGiftGiven    = false;
      _deathCount        = 0;
      _queenElixirGiven  = false;
      _kingSwordGiven    = false;
      _lostToMaou        = false;
      _trueMaouDefeats   = 0;
      _defSeedGiven      = 0;
      _atkSeedGiven      = 0;
      _healBoosted       = false;
      _firstItemShop     = true;
      _firstWeaponShop   = true;
      _firstInn          = true;
      MapEngine.resetProgress(); // ボスクリア・宝箱をリセット
      // NPC初回会話フラグをリセット
      for (const key in _npcFirstTalk) delete _npcFirstTalk[key];
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
        MapEngine.loadMap('throne_room', 5, 5);
        UI.showMessage('おうさまに　はなしかけてみよう。', null);
      }, 50);
    });
  }

  // ── エンディング ──────────────────────────────────────────
  function startEnding() {
    MapEngine.setMoveLock(true);
    Sound.ending();
    UI.showEnding(GameData.ENDING_LINES, () => {
      // エンディング終了→つよくてニューゲーム準備
      setTimeout(() => {
        // 装備なしの素のステータスを保存
        const baseAtk = player.atk - (player.weapon ? (GameData.ITEMS[player.weapon].atk || 0) : 0);
        const baseDef = player.def - (player.armor  ? (GameData.ITEMS[player.armor].def  || 0) : 0)
                                   - (player.shield ? (GameData.ITEMS[player.shield].def || 0) : 0);
        _ngPlusStats = {
          maxHp: player.maxHp,
          maxMp: player.maxMp,
          atk: baseAtk,
          def: baseDef,
          gold: player.gold,
        };
        _isNewGamePlus = true;
        // NG+移行前にフラグをリセット
        _lostToMaou = false;
        _trueMaouDefeats = 0;
        _defSeedGiven = 0;
        _atkSeedGiven = 0;
        player = PLAYER_INIT();
        _showTitle();
      }, 3000);
    });
  }

  // ── 宿屋 ─────────────────────────────────────────────────
  function useInn(cost) {
    if (_firstInn) {
      _firstInn = false;
      UI.showNpcDialog([
        'やどやでは　HPとMPが\nぜんかいする　だけではなく\nどくも　かいふくできる。',
        'げーむを　いちじちゅうだん\nするなら　うえの\nさんぼんせんメニューから',
        'セーブしておけば\nあとで　つづきを\nロード　できるぞ。',
      ], () => { _doInn(cost); });
      return;
    }
    _doInn(cost);
  }

  function _doInn(cost) {
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
    const isWeapon = shopId.includes('weapon');
    const isItem   = shopId.includes('item');

    if (isItem && _firstItemShop) {
      _firstItemShop = false;
      UI.showNpcDialog([
        'どうぐは　マップじょうで\nうえの　さんぼんせん\nメニューから　つかえる。',
        'せんとうちゅうも\nつかえるぞ。',
      ], () => {
        _openShopWithGreeting(shopId);
      });
      return;
    }
    if (isWeapon && _firstWeaponShop) {
      _firstWeaponShop = false;
      UI.showNpcDialog([
        'ぶきや　ぼうぐは\nじどうてきに　そうびされる。',
        'ステータスは　ひだりうえの\n「でこやま」を　おすと\nかくにんできるぞ。',
      ], () => {
        _openShopWithGreeting(shopId);
      });
      return;
    }
    _openShopWithGreeting(shopId);
  }

  function _openShopWithGreeting(shopId) {
    const greeting = _getShopGreeting();
    UI.showMessage(greeting, () => {
      UI.showShop(shopId);
    });
  }

  function _getShopGreeting() {
    const lv = player.level;
    if (lv <= 2) return 'いらっしゃいませ！\nなんでも　そろっております！';
    if (lv <= 4) return 'おこしやすい。\nよいものを　おいてますよ。';
    if (lv === 5) return 'おや　てごわそうな　かた。\nたかいものしか\nおいてないですよ？';
    if (lv === 6) return 'そんな　よれよれで\nかいものですか。\nたかいですよ？';
    return 'ほほう　このくらいの　かたには\nていかでは　うれませんなぁ。\nたっぷり　はらっておくんなさい。';
  }

  // ── アイテムのレベル別価格 ───────────────────────────────
  function getItemPrice(itemId) {
    const item = GameData.ITEMS[itemId];
    if (!item) return 0;
    const base = item.price;
    const lv   = player.level;
    if (lv <= 4) return base;
    if (lv === 5) return Math.floor(base * 1.5);
    if (lv === 6) return Math.floor(base * 3);
    return Math.floor(base * 5); // lv 7+
  }

  // ── アイテム購入 ──────────────────────────────────────────
  function buyItem(itemId) {
    const item = GameData.ITEMS[itemId];
    const price = getItemPrice(itemId);
    if (player.gold < price) return;
    player.gold -= price;

    if (item.type === 'weapon') {
      const oldBonus = player.weapon ? (GameData.ITEMS[player.weapon].atk || 0) : 0;
      if (player.weapon) player.items.push(player.weapon);
      player.weapon = itemId;
      const newBonus = item.atk || 0;
      player.atk = player.atk - oldBonus + newBonus;
    } else if (item.type === 'armor') {
      const oldBonus = player.armor ? (GameData.ITEMS[player.armor].def || 0) : 0;
      if (player.armor) player.items.push(player.armor);
      player.armor = itemId;
      const newBonus = item.def || 0;
      player.def = player.def - oldBonus + newBonus;
    } else if (item.type === 'shield') {
      const oldBonus = player.shield ? (GameData.ITEMS[player.shield].def || 0) : 0;
      if (player.shield) player.items.push(player.shield);
      player.shield = itemId;
      const newBonus = item.def || 0;
      player.def = player.def - oldBonus + newBonus;
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
      const oldBonus = player.weapon ? (GameData.ITEMS[player.weapon].atk || 0) : 0;
      if (player.weapon) player.items.push(player.weapon);
      player.weapon = itemId;
      player.atk = player.atk - oldBonus + (item.atk || 0);
    } else if (item.type === 'armor') {
      const oldBonus = player.armor ? (GameData.ITEMS[player.armor].def || 0) : 0;
      if (player.armor) player.items.push(player.armor);
      player.armor = itemId;
      player.def = player.def - oldBonus + (item.def || 0);
    } else if (item.type === 'shield') {
      const oldBonus = player.shield ? (GameData.ITEMS[player.shield].def || 0) : 0;
      if (player.shield) player.items.push(player.shield);
      player.shield = itemId;
      player.def = player.def - oldBonus + (item.def || 0);
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
    // NG+: ステータスが下がらないようにする
    player.maxHp   = Math.max(player.maxHp, tbl.hp);
    player.maxMp   = Math.max(player.maxMp, tbl.mp);
    player.hp      = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - oldMaxHp));
    player.mp      = Math.min(player.maxMp, player.mp + Math.max(0, player.maxMp - oldMaxMp));
    const newAtk   = _calcAtk();
    const newDef   = _calcDef();
    player.atk     = Math.max(player.atk, newAtk);
    player.def     = Math.max(player.def, newDef);
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
    if (MapEngine.isBossCleared('dungeon2_boss') && !_kingSwordGiven) {
      _kingSwordGiven = true;
      return {
        lines: GameData.NPC.king_after_d2,
        onClose: () => {
          addItem('kings_sword');
          Sound.chest();
          UI.showMessage('おうさまから\nおうじゃのけんを　もらった！\nでんせつの　けんだ！', null);
        }
      };
    }
    if (MapEngine.isBossCleared('dungeon2_boss')) {
      return { lines: ['まおうは　さらに\nつよくなっているだろう。\nきをつけよ！'], onClose: null };
    } else if (MapEngine.isBossCleared('dungeon1_boss')) {
      return { lines: GameData.NPC.king_after_d1, onClose: null };
    } else {
      return {
        lines: ['まおうを　たおし\nひめをたすけよ！\nでこやまよ！'],
        onClose: null
      };
    }
  }

  function getQueenDialog() {
    if (!_queenItemGiven) {
      _queenItemGiven = true;
      return {
        lines: GameData.NPC.queen,
        onClose: () => {
          addItem('bamboo_spear');
          UI.showMessage('おうひさまから\nたけのやりを　もらった！', null);
        }
      };
    }
    // 5回以上死に戻り→エリクサー
    if (_deathCount >= 5 && !_queenElixirGiven) {
      _queenElixirGiven = true;
      return {
        lines: ['まあ　でこやまさん\nそんなに　ぼろぼろに\nなって…。', 'これを　おもちなさい。\nきっと　やくに　たつわ。'],
        onClose: () => {
          for (let i = 0; i < 5; i++) player.items.push('elixir');
          Sound.chest();
          UI.showMessage('おうひさまから\nエリクサーを　５つ　もらった！', null);
        }
      };
    }
    // 真の魔王に負けた回数 > まもりのたねをもらった回数 → もらえる
    if (_trueMaouDefeats > _defSeedGiven) {
      _defSeedGiven++;
      return {
        lines: [
          'まおうごときに　たおされるなんて\nなさけない　ゆうしゃね。',
          'むすめがぶじか　しんぱいだわ。',
          'おうけにつたわる\nまもりのたねを\nひとつぶ　あげるから\nのみなさい。',
          'まもりが　つよくなる　かわりに\nかおが　ぶたみたいに\nすこし　ぶさいくに\nなるのよ。',
          'まぁ　でこやまなら\nいいわよね？',
          'また　まおうに　まけたら\nまもりのたねを　あげるわ。\nもっと　ぶさいくに\nなっちゃうけど。',
          'フィールドで　しゅぎょう\nしている　ぼうけんしゃには\nあった？',
          'かいふくまほうも\nきょうかしてもらえる\nらしいわよ。',
        ],
        onClose: () => {
          player.def += 3;
          UI.updateStatus(player);
          Sound.heal();
          UI.showMessage('まもりのたねを　のんだ！\nぼうぎょりょくが　３あがった！', null);
        }
      };
    }
    // まもりのたね済み＋魔王敗北後→王女のヒント
    if (_lostToMaou && _defSeedGiven > 0) {
      return {
        lines: [
          'むすめも　まおうじょうで\nしんぱいしているわ。',
          'もし　むすめの　ちかくに\nいけたら　はなしかけてみて。',
          'おうけには　ちからのタネも\nつたわっているの。\nむすめが　もっているはずよ。',
        ],
        onClose: null
      };
    }
    return {
      lines: ['たびに　きをつけて\nでこやまよ。'],
      onClose: null
    };
  }

  // ── ゲームフェーズ判定 ──────────────────────────────────
  function _getGamePhase() {
    if (_lostToMaou) return 3;
    if (MapEngine.isBossCleared('dungeon2_boss')) return 2;
    if (MapEngine.isBossCleared('dungeon1_boss')) return 1;
    return 0;
  }

  const _npcFirstTalk = {}; // { npcId_phase: true } 初回会話済み

  function getNpcLines(npcId) {
    const phased = GameData.NPC_PHASED && GameData.NPC_PHASED[npcId];
    if (phased) {
      const phase = _getGamePhase();
      // NG+のPhase0は専用セリフ
      const pool = (_isNewGamePlus && phase === 0 && phased.ngplus) ? phased.ngplus : (phased[phase] || phased[0]);
      if (!pool) return GameData.NPC[npcId];
      // { first, random } 構造 → 初回は fixed、2回目以降ランダム
      if (pool.first && pool.random) {
        const key = npcId + '_' + phase;
        if (!_npcFirstTalk[key]) {
          _npcFirstTalk[key] = true;
          return pool.first;
        }
        return pool.random[Math.floor(Math.random() * pool.random.length)];
      }
      // 配列の配列 → ランダム選択
      if (Array.isArray(pool[0])) {
        return pool[Math.floor(Math.random() * pool.length)];
      }
      return pool;
    }
    return GameData.NPC[npcId];
  }

  function getPrincessSecretDialog() {
    // 魔王撃破後は会えない（姫はエンディングへ）
    if (MapEngine.isBossCleared('maou')) return null;
    // 初回 or 真の魔王に負けた回数 >= 力のタネをもらった回数
    if (_atkSeedGiven === 0 || _trueMaouDefeats >= _atkSeedGiven) {
      _atkSeedGiven++;
      return {
        lines: [
          'でこやま…\nたすけにきてくれたのね。',
          'でも　まおうを　たおさなければ\nにげだせないわ。',
          'こっそり　おうけにつたわる\nちからのタネを　わたすから\nかならず　たすけて。',
        ],
        onClose: () => {
          player.atk += 2;
          UI.updateStatus(player);
          Sound.heal();
          UI.showMessage('ちからのタネを　のんだ！\nこうげきりょくが　２あがった！', null);
        }
      };
    }
    return {
      lines: ['でこやま…\nかならず　まおうを　たおして。\nわたし　しんじてるわ。'],
      onClose: null,
    };
  }

  let _slimeGiftGiven = false;

  function getFriendlySlimeDialog() {
    // Lv2未満 or dungeon2_boss撃破後 → 表示しない
    if (player.level < 2 || MapEngine.isBossCleared('dungeon2_boss')) return null;

    if (!MapEngine.isBossCleared('dungeon1_boss')) {
      // 草の洞窟のボス前 → せいどうのたて
      if (!_slimeGiftGiven) {
        _slimeGiftGiven = true;
        return {
          lines: ['いじめないでくれよー\nいいもの　あげるからさー'],
          onClose: () => {
            addItem('bronze_shield');
            Sound.chest();
            UI.showMessage('スライムから\nせいどうのたてを　もらった！', null);
          }
        };
      }
      return { lines: ['ぼくは　いいスライムだよー\nいじめないでね。'], onClose: null };
    } else {
      // 草の洞窟クリア後、まのとうボス前 → みかがみのたて
      if (!_slimeGiftGiven || _slimeGiftGiven === 'bronze') {
        _slimeGiftGiven = 'mirror';
        return {
          lines: ['おお　つよくなったね！\nこれも　あげるよー'],
          onClose: () => {
            addItem('mirror_shield');
            Sound.chest();
            UI.showMessage('スライムから\nみかがみのたてを　もらった！', null);
          }
        };
      }
      return { lines: ['まのとうには　きをつけてねー\nドラゴンが　いるよー'], onClose: null };
    }
  }

  function doubleSpellPower() {
    _spellPowerDoubled = true;
  }

  function isSpellDoubled() {
    return _spellPowerDoubled;
  }

  function revive() {
    _deathCount++;
    // 復活：HP/MP全回復・毒解除・金半減
    player.hp       = player.maxHp;
    player.mp       = player.maxMp;
    player.poisoned = false;
    player.gold     = Math.floor(player.gold / 2);
    UI.updateStatus(player);
  }

  // ── セーブ・ロード ────────────────────────────────────────
  function saveGame() {
    const data = {
      version: 1,
      player: JSON.parse(JSON.stringify(player)),
      map:    MapEngine.getMapState(),
      flags:  { kingGoldGiven: _kingGoldGiven, queenItemGiven: _queenItemGiven, spellPowerDoubled: _spellPowerDoubled, slimeGiftGiven: _slimeGiftGiven, deathCount: _deathCount, queenElixirGiven: _queenElixirGiven, kingSwordGiven: _kingSwordGiven, trueMaouDefeats: _trueMaouDefeats, defSeedGiven: _defSeedGiven, healBoosted: _healBoosted, firstItemShop: _firstItemShop, firstWeaponShop: _firstWeaponShop, firstInn: _firstInn, lostToMaou: _lostToMaou, atkSeedGiven: _atkSeedGiven },
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
      _kingGoldGiven     = data.flags ? data.flags.kingGoldGiven     : false;
      _queenItemGiven    = data.flags ? data.flags.queenItemGiven    : false;
      _spellPowerDoubled = data.flags ? data.flags.spellPowerDoubled : false;
      _slimeGiftGiven    = data.flags ? data.flags.slimeGiftGiven    : false;
      _deathCount        = data.flags ? (data.flags.deathCount || 0) : 0;
      _queenElixirGiven  = data.flags ? !!data.flags.queenElixirGiven : false;
      _kingSwordGiven    = data.flags ? !!data.flags.kingSwordGiven   : false;
      _trueMaouDefeats   = data.flags ? (data.flags.trueMaouDefeats || 0) : 0;
      _defSeedGiven      = data.flags ? (data.flags.defSeedGiven   || 0) : 0;
      _healBoosted       = data.flags ? !!data.flags.healBoosted : false;
      _firstItemShop     = data.flags ? (data.flags.firstItemShop !== false)   : true;
      _firstWeaponShop   = data.flags ? (data.flags.firstWeaponShop !== false) : true;
      _firstInn          = data.flags ? (data.flags.firstInn !== false)        : true;
      _lostToMaou        = data.flags ? !!data.flags.lostToMaou : false;
      _atkSeedGiven      = data.flags ? (data.flags.atkSeedGiven || 0) : 0;
      UI.updateStatus(player);
      UI.showScene('game');
      setTimeout(() => {
        MapEngine.setMapState(data.map);
        MapEngine.setMoveLock(false); // ロード後の移動ロック解除
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
    getQueenDialog,
    getItemPrice,
    doubleSpellPower,
    isSpellDoubled,
    getFriendlySlimeDialog,
    addTrueMaouDefeat: () => { _trueMaouDefeats++; },
    hasTrueMaouDefeats: () => _trueMaouDefeats > 0,
    setLostToMaou: () => { _lostToMaou = true; },
    getNpcLines,
    getPrincessSecretDialog,
    isNewGamePlus: () => _isNewGamePlus,
    boostHeal: () => { _healBoosted = true; },
    isHealBoosted: () => _healBoosted,
  };

})();
