// ============================================================
//  ui.js — でこやまクエスト UIエンジン
//  メッセージウィンドウ・戦闘メニュー・サブメニュー管理
// ============================================================

const UI = (() => {

  // ── DOM参照 ──────────────────────────────────────────────
  let elMsg, elMsgHint, elBattleMenu, elSpellMenu, elItemMenu, elShopMenu;
  let elSpellList, elItemList, elShopList, elShopTitle;
  let elStatusHp, elStatusMp, elStatusOverlay;

  // ── メッセージキュー ─────────────────────────────────────
  let msgQueue   = [];
  let msgCallback = null;
  let msgTyping  = false;
  let msgFull    = '';
  let msgCurrent = '';
  let msgTimer   = null;

  const CHAR_INTERVAL = 60; // 文字送り速度(ms)

  // ── 初期化 ────────────────────────────────────────────────
  function init() {
    elMsg        = document.getElementById('message-text');
    elMsgHint    = document.getElementById('message-tap-hint');
    elBattleMenu = document.getElementById('battle-menu');
    elSpellMenu  = document.getElementById('spell-menu');
    elItemMenu   = document.getElementById('item-menu');
    elShopMenu   = document.getElementById('shop-menu');
    elSpellList  = document.getElementById('spell-list');
    elItemList   = document.getElementById('item-list');
    elShopList   = document.getElementById('shop-list');
    elShopTitle  = document.getElementById('shop-title');
    elStatusHp      = document.getElementById('status-hp');
    elStatusMp      = document.getElementById('status-mp');
    elStatusOverlay = document.getElementById('status-overlay');

    // ステータスバーの名前をタップでステータス画面
    document.getElementById('status-name').addEventListener('click', _toggleStatusOverlay);
    document.getElementById('status-name').addEventListener('touchstart', (e) => {
      e.preventDefault(); _toggleStatusOverlay();
    }, { passive: false });
    elStatusOverlay.addEventListener('click', _hideStatusOverlay);
    elStatusOverlay.addEventListener('touchstart', (e) => {
      e.preventDefault(); _hideStatusOverlay();
    }, { passive: false });

    // メッセージ欄タップで次へ
    document.getElementById('message-window').addEventListener('click', _onMsgTap);
    document.getElementById('message-window').addEventListener('touchstart', (e) => {
      e.preventDefault(); _onMsgTap();
    }, { passive: false });

    // 戦闘コマンドボタン
    document.getElementById('btn-fight').addEventListener('click', () => Battle.execCommand('fight'));
    document.getElementById('btn-run'  ).addEventListener('click', () => Battle.execCommand('run'));
    document.getElementById('btn-spell').addEventListener('click', _openSpellMenu);
    document.getElementById('btn-item' ).addEventListener('click', _openItemMenu);
    document.getElementById('btn-spell-cancel').addEventListener('click', () => {
      elSpellMenu.classList.add('hidden');
      showBattleMenu(true);
    });
    document.getElementById('btn-item-cancel').addEventListener('click', () => {
      elItemMenu.classList.add('hidden');
      showBattleMenu(true);
    });
    document.getElementById('btn-shop-cancel').addEventListener('click', () => {
      elShopMenu.classList.add('hidden');
      MapEngine.setMoveLock(false);
      clearMessage();
    });
  }

  // ── メッセージ表示 ────────────────────────────────────────
  // callback: メッセージ表示完了&タップ後に呼ばれる
  function showMessage(text, callback) {
    msgQueue.push({ text, callback });
    if (!msgTyping && msgQueue.length === 1) {
      _dequeueMsg();
    }
  }

  function _dequeueMsg() {
    if (msgQueue.length === 0) return;
    const { text, callback } = msgQueue[0];
    msgFull    = text;
    msgCurrent = '';
    msgCallback = callback;
    msgTyping  = true;
    elMsgHint.classList.add('hidden');
    elMsg.textContent = '';
    _typeChar();
  }

  function _typeChar() {
    if (msgCurrent.length < msgFull.length) {
      msgCurrent += msgFull[msgCurrent.length];
      elMsg.textContent = msgCurrent;
      msgTimer = setTimeout(_typeChar, CHAR_INTERVAL);
    } else {
      // 文字送り完了
      msgTyping = false;
      elMsgHint.classList.remove('hidden');
    }
  }

  function _onMsgTap() {
    if (msgTyping) {
      // 全文即表示
      clearTimeout(msgTimer);
      msgCurrent = msgFull;
      elMsg.textContent = msgCurrent;
      msgTyping = false;
      elMsgHint.classList.remove('hidden');
      return;
    }
    // タップで次のメッセージへ
    elMsgHint.classList.add('hidden');
    const done = msgQueue.shift();
    if (done && done.callback) done.callback();
    if (msgQueue.length > 0) {
      _dequeueMsg();
    }
  }

  function clearMessage() {
    msgQueue   = [];
    msgTyping  = false;
    msgCallback = null;
    clearTimeout(msgTimer);
    if (elMsg) elMsg.textContent = '　';
    if (elMsgHint) elMsgHint.classList.add('hidden');
  }

  // ── ステータス更新 ────────────────────────────────────────
  function updateStatus(player) {
    if (!elStatusHp) return;
    const hpStr = String(player.hp).padStart(3);
    const mhStr = String(player.maxHp).padStart(3);
    const mpStr = String(player.mp).padStart(3);
    const mmStr = String(player.maxMp).padStart(3);
    elStatusHp.textContent = `HP:${hpStr}/${mhStr}`;
    elStatusMp.textContent = `MP:${mpStr}/${mmStr}`;
    const elGold = document.getElementById('status-gold');
    if (elGold) elGold.textContent = `G:${String(player.gold).padStart(4)}`;
    // 毒状態表示
    const elName = document.getElementById('status-name');
    if (elName) {
      elName.textContent = player.poisoned ? 'でこやま[どく]' : 'でこやま';
      elName.style.color = player.poisoned ? '#cc44ff' : '';
    }
  }

  // ── 戦闘メニュー ─────────────────────────────────────────
  function showBattleMenu(show) {
    if (show) {
      elBattleMenu.classList.remove('hidden');
    } else {
      elBattleMenu.classList.add('hidden');
    }
  }

  // ── じゅもんサブメニュー ─────────────────────────────────
  function _openSpellMenu() {
    showBattleMenu(false);
    const player = Game.getPlayer();
    elSpellList.innerHTML = '';

    if (!player.spells || player.spells.length === 0) {
      showBattleMenu(true);
      showMessage('おぼえている　じゅもんは\nない。', () => showBattleMenu(true));
      return;
    }

    player.spells.forEach(spellId => {
      const sp  = GameData.SPELLS[spellId];
      const btn = document.createElement('button');
      btn.className = 'spell-item';
      btn.innerHTML = `${sp.name}<span class="spell-mp">MP:${sp.mp}</span>`;
      btn.addEventListener('click', () => {
        elSpellMenu.classList.add('hidden');
        Battle.execSpell(spellId);
      });
      elSpellList.appendChild(btn);
    });

    elSpellMenu.classList.remove('hidden');
  }

  // ── どうぐサブメニュー ────────────────────────────────────
  function _openItemMenu() {
    showBattleMenu(false);
    const player = Game.getPlayer();
    elItemList.innerHTML = '';

    const usable = (player.items || []).filter(id => {
      const item = GameData.ITEMS[id];
      return item && item.type === 'consumable';
    });

    if (usable.length === 0) {
      showMessage('どうぐが　ない。', () => showBattleMenu(true));
      return;
    }

    // 重複をまとめて数量表示
    const counts = {};
    usable.forEach(id => { counts[id] = (counts[id] || 0) + 1; });

    Object.entries(counts).forEach(([itemId, count]) => {
      const item = GameData.ITEMS[itemId];
      const btn  = document.createElement('button');
      btn.className = 'item-item';
      btn.textContent = count > 1 ? `${item.name} ×${count}` : item.name;
      btn.addEventListener('click', () => {
        elItemMenu.classList.add('hidden');
        Battle.execItem(itemId);
      });
      elItemList.appendChild(btn);
    });

    elItemMenu.classList.remove('hidden');
  }

  // ── ショップ表示 ──────────────────────────────────────────
  function showShop(shopId, onClose) {
    const shop   = GameData.SHOPS[shopId];
    const player = Game.getPlayer();

    elShopTitle.textContent = `${shop.name}　（${player.gold}Ｇ）`;
    elShopList.innerHTML = '';

    shop.items.forEach(itemId => {
      const item  = GameData.ITEMS[itemId];
      const price = Game.getItemPrice(itemId);

      // 現在の装備より弱い場合は購入不可
      let isWeaker = false;
      if (item.type === 'weapon') {
        const cur = player.weapon ? GameData.ITEMS[player.weapon] : null;
        if (cur && (item.atk || 0) <= (cur.atk || 0)) isWeaker = true;
      } else if (item.type === 'armor') {
        const cur = player.armor ? GameData.ITEMS[player.armor] : null;
        if (cur && (item.def || 0) <= (cur.def || 0)) isWeaker = true;
      } else if (item.type === 'shield') {
        const cur = player.shield ? GameData.ITEMS[player.shield] : null;
        if (cur && (item.def || 0) <= (cur.def || 0)) isWeaker = true;
      }

      const btn = document.createElement('button');
      btn.className = 'shop-item' + (isWeaker ? ' shop-item-weak' : '');
      btn.innerHTML = `${item.name}<span class="item-price">${price}Ｇ</span>`;

      if (isWeaker) {
        btn.addEventListener('click', () => {
          showMessage('いまの　そうびより\nよわいので　かえない。', null);
        });
      } else {
        btn.addEventListener('click', () => {
          if (player.gold < price) {
            showMessage('おかねが　たりない！', null);
            return;
          }
          Game.buyItem(itemId);
          elShopTitle.textContent = `${shop.name}　（${player.gold}Ｇ）`;
          Sound.buy();
          showMessage(`${item.name}を\nかいました！`, null);
        });
      }
      elShopList.appendChild(btn);
    });

    elShopMenu.classList.remove('hidden');
    MapEngine.setMoveLock(true);
  }

  // ── NPC会話 ──────────────────────────────────────────────
  function showNpcDialog(lines, onClose) {
    MapEngine.setMoveLock(true);
    let i = 0;

    function nextLine() {
      if (i >= lines.length) {
        MapEngine.setMoveLock(false);
        clearMessage();
        if (onClose) onClose();
        return;
      }
      showMessage(lines[i++], nextLine);
    }
    nextLine();
  }

  // ── 宿屋確認 ─────────────────────────────────────────────
  function showInnDialog(cost, onYes, onNo) {
    MapEngine.setMoveLock(true);
    showMessage(
      `やどちん　${cost}ゴールドです。\nおとまりになりますか？`,
      () => _showYesNo(onYes, onNo)
    );
  }

  function _showYesNo(onYes, onNo) {
    const elMsg = document.getElementById('message-text');
    const elHint = document.getElementById('message-tap-hint');
    elHint.classList.add('hidden');
    elMsg.innerHTML =
      '<div style="display:flex;gap:16px;justify-content:center;margin-top:8px">' +
      '<button class="battle-btn" id="_yn-yes" style="flex:1;padding:10px">はい</button>' +
      '<button class="battle-btn" id="_yn-no"  style="flex:1;padding:10px">やめる</button>' +
      '</div>';
    function doYes(e) { e.preventDefault(); e.stopPropagation(); if (onYes) onYes(); MapEngine.setMoveLock(false); }
    function doNo(e)  { e.preventDefault(); e.stopPropagation(); if (onNo)  onNo();  MapEngine.setMoveLock(false); }
    document.getElementById('_yn-yes').addEventListener('click', doYes);
    document.getElementById('_yn-yes').addEventListener('touchstart', doYes, { passive: false });
    document.getElementById('_yn-no').addEventListener('click', doNo);
    document.getElementById('_yn-no').addEventListener('touchstart', doNo, { passive: false });
  }

  // ── ステータス確認オーバーレイ ────────────────────────────
  function _toggleStatusOverlay() {
    if (elStatusOverlay.classList.contains('hidden')) {
      _showStatusOverlay();
    } else {
      _hideStatusOverlay();
    }
  }

  function _showStatusOverlay() {
    const p = Game.getPlayer();
    const lv = p.level;
    const nextLvData = GameData.LEVEL_TABLE[lv + 1];
    const expNext = nextLvData ? nextLvData.exp : '---';

    document.getElementById('sd-name').textContent   = p.name;
    document.getElementById('sd-level').textContent  = `${lv}`;
    document.getElementById('sd-exp').textContent    = `${p.exp} / ${expNext}`;
    document.getElementById('sd-hp').textContent     = `${p.hp} / ${p.maxHp}`;
    document.getElementById('sd-mp').textContent     = `${p.mp} / ${p.maxMp}`;
    document.getElementById('sd-atk').textContent    = `${p.atk}`;
    document.getElementById('sd-def').textContent    = `${p.def}`;
    document.getElementById('sd-weapon').textContent = p.weapon ? (GameData.ITEMS[p.weapon].name) : 'なし';
    document.getElementById('sd-armor').textContent  = p.armor  ? (GameData.ITEMS[p.armor].name)  : 'なし';
    document.getElementById('sd-shield').textContent = p.shield ? (GameData.ITEMS[p.shield].name) : 'なし';
    document.getElementById('sd-gold').textContent   = `${p.gold} Ｇ`;

    elStatusOverlay.classList.remove('hidden');
  }

  function _hideStatusOverlay() {
    elStatusOverlay.classList.add('hidden');
  }

  // ── ゲームメニュー（セーブ/ロード） ─────────────────────
  let elGameMenu;
  function _initGameMenu() {
    if (elGameMenu) return;
    elGameMenu = document.getElementById('game-menu-overlay');
    document.getElementById('btn-save').addEventListener('click', () => {
      const ok = Game.saveGame();
      _hideGameMenu();
      showMessage(ok ? 'セーブしました！' : 'セーブに　しっぱいした…', null);
    });
    document.getElementById('btn-load').addEventListener('click', () => {
      _hideGameMenu();
      if (!Game.hasSaveData()) {
        showMessage('セーブデータが　ありません。', null);
        return;
      }
      const ok = Game.loadGame();
      if (!ok) showMessage('ロードに　しっぱいした…', null);
    });
    document.getElementById('btn-menu-close').addEventListener('click', _hideGameMenu);
    document.getElementById('btn-field-item').addEventListener('click', () => {
      _hideGameMenu();
      _showFieldItemMenu();
    });
    document.getElementById('btn-field-spell').addEventListener('click', () => {
      _hideGameMenu();
      _showFieldSpellMenu();
    });
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const muted = BGM.toggleMute();
        muteBtn.textContent = muted ? '♪ おとOFF' : '♪ おとON';
      });
    }
  }

  function showGameMenu() {
    _initGameMenu();
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) muteBtn.textContent = BGM.isMuted() ? '♪ おとOFF' : '♪ おとON';
    elGameMenu.classList.remove('hidden');
  }

  function _hideGameMenu() {
    if (elGameMenu) elGameMenu.classList.add('hidden');
  }

  // ── フィールドどうぐメニュー ──────────────────────────────
  function _showFieldItemMenu() {
    const elMenu = document.getElementById('field-item-menu');
    const elList = document.getElementById('field-item-list');
    const player = Game.getPlayer();
    elList.innerHTML = '';

    // 使用可能なアイテムをカウント
    const itemCounts = {};
    player.items.forEach(id => {
      const item = GameData.ITEMS[id];
      if (item && item.type === 'consumable') {
        itemCounts[id] = (itemCounts[id] || 0) + 1;
      }
    });

    if (Object.keys(itemCounts).length === 0) {
      showMessage('つかえる　どうぐがない。', null);
      return;
    }

    MapEngine.setMoveLock(true);
    for (const [id, count] of Object.entries(itemCounts)) {
      const item = GameData.ITEMS[id];
      const btn = document.createElement('button');
      btn.className = 'item-item';
      btn.textContent = `${item.name}　×${count}`;
      btn.addEventListener('click', () => {
        _hideFieldItemMenu();
        _useFieldItem(id);
      });
      elList.appendChild(btn);
    }
    elMenu.classList.remove('hidden');

    document.getElementById('btn-field-item-cancel').onclick = () => {
      _hideFieldItemMenu();
    };
  }

  function _hideFieldItemMenu() {
    document.getElementById('field-item-menu').classList.add('hidden');
    MapEngine.setMoveLock(false);
  }

  function _useFieldItem(itemId) {
    const item = GameData.ITEMS[itemId];
    if (!item) return;

    if (item.effect === 'heal') {
      Game.removeItem(itemId);
      Game.healHp(item.power);
      Sound.heal();
      showMessage(`${item.name}をつかった！\nHPが　${item.power}　かいふくした！`, null);
    } else if (item.effect === 'mp_heal') {
      Game.removeItem(itemId);
      const healAmt = item.power > 0 ? item.power : Math.floor(Game.getPlayer().maxMp * 0.8);
      Game.healMp(healAmt);
      Sound.heal();
      showMessage(`${item.name}をつかった！\nMPが　${healAmt}　かいふくした！`, null);
    } else if (item.effect === 'cure_poison') {
      if (!Game.isPoisoned()) {
        showMessage('どくに　かかっていない。', null);
        return;
      }
      Game.removeItem(itemId);
      Game.setPoison(false);
      Sound.curePoison();
      showMessage(`${item.name}をつかった！\nどくが　なおった！`, null);
    } else if (item.effect === 'elixir') {
      Game.removeItem(itemId);
      Game.healHp(9999);
      Game.healMp(9999);
      Sound.heal();
      showMessage(`${item.name}をつかった！\nHPとMPが　ぜんかいふくした！`, null);
    } else {
      showMessage('ここでは　つかえない。', null);
    }
  }

  // ── フィールドじゅもんメニュー ──────────────────────────
  function _showFieldSpellMenu() {
    const elMenu = document.getElementById('field-spell-menu');
    const elList = document.getElementById('field-spell-list');
    const player = Game.getPlayer();
    elList.innerHTML = '';

    const healSpells = player.spells.filter(id => {
      const sp = GameData.SPELLS[id];
      return sp && sp.type === 'heal';
    });

    if (healSpells.length === 0) {
      showMessage('つかえる　じゅもんがない。', null);
      return;
    }

    MapEngine.setMoveLock(true);
    healSpells.forEach(spellId => {
      const sp = GameData.SPELLS[spellId];
      const btn = document.createElement('button');
      btn.className = 'spell-item';
      btn.innerHTML = `${sp.name}<span class="spell-mp">MP:${sp.mp}</span>`;
      btn.addEventListener('click', () => {
        _hideFieldSpellMenu();
        _useFieldSpell(spellId);
      });
      elList.appendChild(btn);
    });
    elMenu.classList.remove('hidden');

    document.getElementById('btn-field-spell-cancel').onclick = () => {
      _hideFieldSpellMenu();
    };
  }

  function _hideFieldSpellMenu() {
    document.getElementById('field-spell-menu').classList.add('hidden');
    MapEngine.setMoveLock(false);
  }

  function _useFieldSpell(spellId) {
    const sp = GameData.SPELLS[spellId];
    const player = Game.getPlayer();
    if (player.mp < sp.mp) {
      showMessage('MPが　たりない！', null);
      return;
    }
    Game.useMp(sp.mp);
    let heal = _fieldRand(sp.power[0], sp.power[1]);
    if (Game.isHealBoosted()) heal = Math.floor(heal * 1.3);
    Game.healHp(heal);
    Sound.heal();
    showMessage(`${sp.name}！\nHPが　${heal}　かいふくした！`, null);
  }

  function _fieldRand(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function hideAllSubMenus() {
    elSpellMenu.classList.add('hidden');
    elItemMenu.classList.add('hidden');
    elShopMenu.classList.add('hidden');
  }

  // ── シーン切り替え ────────────────────────────────────────
  function showScene(sceneId) {
    document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`scene-${sceneId}`);
    if (target) target.classList.add('active');
  }

  // ── オープニングテキスト表示 ─────────────────────────────
  function showOpening(lines, onFinish) {
    showScene('opening');
    const elText = document.getElementById('opening-text');
    const elHint = document.getElementById('opening-tap-hint');
    const win    = document.querySelector('.opening-window');

    let lineIdx   = 0;
    let isTyping  = false;
    let typTimer  = null;
    let curFull   = '';
    let curShown  = '';
    let canTap    = false; // 多重タップ防止フラグ

    function showLine(text) {
      curFull  = text;
      curShown = '';
      isTyping = true;
      canTap   = false;
      elText.textContent = '';
      elHint.classList.add('hidden');
      typeChar();
    }

    function typeChar() {
      if (curShown.length < curFull.length) {
        curShown += curFull[curShown.length];
        elText.textContent = curShown;
        typTimer = setTimeout(typeChar, 70);
      } else {
        isTyping = false;
        canTap   = true;
        elHint.classList.remove('hidden');
      }
    }

    function onTap(e) {
      e.preventDefault();
      if (isTyping) {
        // 文字送り中→即全文表示
        clearTimeout(typTimer);
        curShown = curFull;
        elText.textContent = curFull;
        isTyping = false;
        canTap   = true;
        elHint.classList.remove('hidden');
        return;
      }
      if (!canTap) return; // 二重タップ防止
      canTap = false;

      // 次の行へ
      if (lineIdx >= lines.length) {
        win.removeEventListener('click',      onTap);
        win.removeEventListener('touchstart', onTouchTap);
        if (onFinish) onFinish();
        return;
      }
      showLine(lines[lineIdx++]);
    }

    function onTouchTap(e) {
      e.preventDefault();
      onTap(e);
    }

    win.addEventListener('click',      onTap);
    win.addEventListener('touchstart', onTouchTap, { passive: false });

    // 最初の行を表示
    showLine(lines[lineIdx++]);
  }

  // ── エンディングテキスト表示 ─────────────────────────────
  function showEnding(lines, onFinish) {
    showScene('ending');
    const elText = document.getElementById('ending-text');
    const elHint = document.getElementById('ending-tap-hint');
    const cont   = document.getElementById('ending-content');
    // Fin表示で変更されたスタイルをリセット
    elText.style.fontSize = '';
    elText.style.textAlign = '';
    elText.style.color = '';
    elText.style.fontFamily = '';
    elText.style.letterSpacing = '';
    elText.style.transition = '';
    elText.style.opacity = '0';
    let i = 0;
    let canTap = false;

    function onTap(e) {
      if (e) e.preventDefault();
      if (!canTap) return;
      canTap = false;
      nextLine();
    }
    function onTouchTap(e) {
      e.preventDefault();
      e.stopPropagation();
      onTap(e);
    }

    cont.addEventListener('touchstart', onTouchTap, { passive: false });
    cont.addEventListener('click', onTap);

    function nextLine() {
      if (i >= lines.length) {
        cont.removeEventListener('touchstart', onTouchTap);
        cont.removeEventListener('click', onTap);
        if (onFinish) onFinish();
        return;
      }
      canTap = false;
      elText.style.opacity = '0';
      elHint.classList.add('hidden');

      const full = lines[i++];
      const isLast = (i === lines.length);

      setTimeout(() => {
        elText.textContent = full;
        elText.style.transition = 'opacity 1s';
        elText.style.opacity = '1';

        if (isLast) {
          elText.style.fontSize = '48px';
          elText.style.textAlign = 'center';
          elText.style.color = '#f8e800';
          elText.style.fontFamily = "'Great Vibes', cursive";
          elText.style.letterSpacing = '4px';
          elText.style.transition = 'opacity 2s';
          // Fin表示後3秒→タップでタイトルに戻る
          setTimeout(() => {
            canTap = true;
            elHint.classList.remove('hidden');
          }, 3000);
          return;
        }

        // 3秒後にタップ受付開始
        setTimeout(() => {
          canTap = true;
          elHint.classList.remove('hidden');
        }, 3000);
      }, 300);
    }
    nextLine();
  }

  // ── 公開API ───────────────────────────────────────────────
  return {
    init,
    showMessage,
    clearMessage,
    updateStatus,
    showBattleMenu,
    showShop,
    showNpcDialog,
    showInnDialog,
    showScene,
    showOpening,
    showEnding,
    hideAllSubMenus,
    showGameMenu,
  };

})();
