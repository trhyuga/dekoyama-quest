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
      const item = GameData.ITEMS[itemId];
      const btn  = document.createElement('button');
      btn.className = 'shop-item';
      btn.innerHTML = `${item.name}<span class="item-price">${item.price}Ｇ</span>`;
      btn.addEventListener('click', () => {
        if (player.gold < item.price) {
          showMessage('おかねが　たりない！', null);
          return;
        }
        Game.buyItem(itemId);
        elShopTitle.textContent = `${shop.name}　（${player.gold}Ｇ）`;
        Sound.buy();
        showMessage(`${item.name}を\nかいました！`, null);
      });
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
  }

  function showGameMenu() {
    _initGameMenu();
    elGameMenu.classList.remove('hidden');
  }

  function _hideGameMenu() {
    if (elGameMenu) elGameMenu.classList.add('hidden');
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
    let i = 0;

    // 全テキストを順番に表示（フェードイン風）
    function nextLine() {
      if (i >= lines.length) {
        if (onFinish) onFinish();
        return;
      }
      elText.style.opacity = '0';
      elHint.classList.add('hidden');

      const full = lines[i++];
      // 最後の「おわり」は特別演出
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
          return; // Fin表示で終了
        }

        // 読み飛ばし防止：3秒後にタップ受付開始
        setTimeout(() => {
          elHint.classList.remove('hidden');
          function onTap(e) {
            if (e) e.preventDefault();
            nextLine();
          }
          cont.addEventListener('click', onTap, { once: true });
          cont.addEventListener('touchstart', onTap, { once: true, passive: false });
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
