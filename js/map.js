// ============================================================
//  map.js — でこやまクエスト マップ描画・移動エンジン
// ============================================================

const MapEngine = (() => {

  // ── 内部状態 ─────────────────────────────────────────────
  const state = {
    currentMapId : 'world',
    playerX      : 5,
    playerY      : 4,
    cameraX      : 0,      // カメラ左上タイル座標
    cameraY      : 0,
    moving       : false,  // 移動アニメ中フラグ
    stepCount    : 0,      // エンカウントカウンタ
    openedChests : {},     // { mapId_x_y: true }
    clearedBoss  : {},     // { bossId: true }
    torchLife    : 0,      // たいまつ残り歩数
    walkFrame    : 0,      // 歩行アニメフレーム（0/1交互）
  };

  const TORCH_MAX = 40;   // たいまつ1本の持続歩数

  // ── Canvas設定 ────────────────────────────────────────────
  let canvas, ctx;
  const TILE  = 40;   // タイルサイズ(px)
  const VIEW_W = 9;   // 横タイル数（奇数推奨）
  const VIEW_H = 9;   // 縦タイル数

  // プレイヤーのドット絵（超簡易CSSスプライト風）
  const PLAYER_COLOR = '#f8e800'; // 黄色

  // ── 初期化 ────────────────────────────────────────────────
  function init(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    _resizeCanvas();
    window.addEventListener('resize', _resizeCanvas);
    canvas.addEventListener('click',     _onTap);
    canvas.addEventListener('touchstart', _onTouchStart, { passive: false });
  }

  function _resizeCanvas() {
    // シーンが非表示（display:none）の場合 clientWidth/Height は 0 になるためスキップ
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
    canvas.width  = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    render();
  }

  // 外部から呼び出せる公開リサイズメソッド（シーン表示後に呼ぶ）
  function resize() {
    _resizeCanvas();
  }

  // ── マップロード ──────────────────────────────────────────
  function loadMap(mapId, destX, destY) {
    const mapDef = GameData.MAPS[mapId];
    if (!mapDef) return;
    state.currentMapId = mapId;
    state.playerX = (destX !== undefined) ? destX : mapDef.startX;
    state.playerY = (destY !== undefined) ? destY : mapDef.startY;
    // ダンジョン進入時：たいまつ自動消費
    if (mapDef.isDungeon && !_isDungeonBossCleared()) {
      _tryLightTorch(true);
    } else {
      state.torchLife = 0;
    }
    // シーンが表示済みの状態で呼ばれるため、ここで正しいサイズを取得する
    _resizeCanvas();
    _centerCamera();
    render();
  }

  // ── 実際の表示タイル行数（キャンバス高さから動的に算出） ─
  function _getViewH() {
    if (!canvas || canvas.clientWidth === 0) return VIEW_H;
    const tileSize = canvas.clientWidth / VIEW_W;
    return Math.ceil(canvas.clientHeight / tileSize);
  }

  // ── カメラ中央揃え ────────────────────────────────────────
  function _centerCamera() {
    const map   = _currentMap();
    const viewH = _getViewH();
    const halfW = Math.floor(VIEW_W / 2);
    const halfH = Math.floor(viewH  / 2);
    state.cameraX = Math.max(0, Math.min(state.playerX - halfW, map.width  - VIEW_W));
    state.cameraY = Math.max(0, Math.min(state.playerY - halfH, map.height - viewH));
  }

  // ── タップ処理 ────────────────────────────────────────────
  function _onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect  = canvas.getBoundingClientRect();
    _handleTap(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  function _onTap(e) {
    const rect = canvas.getBoundingClientRect();
    _handleTap(e.clientX - rect.left, e.clientY - rect.top);
  }

  function _handleTap(tapX, tapY) {
    if (state.moving) return;
    // タッチ座標 → タイル座標
    const tileSize = canvas.width / VIEW_W;
    const tapTileX = Math.floor(tapX / tileSize) + state.cameraX;
    const tapTileY = Math.floor(tapY / tileSize) + state.cameraY;

    // プレイヤーとの差分で方向を決定
    const dx = tapTileX - state.playerX;
    const dy = tapTileY - state.playerY;

    let moveX = 0, moveY = 0;
    if (Math.abs(dx) >= Math.abs(dy)) {
      moveX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    } else {
      moveY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    }
    if (moveX === 0 && moveY === 0) return;

    _tryMove(moveX, moveY);
  }

  function _tryMove(dx, dy) {
    const map   = _currentMap();
    const nx    = state.playerX + dx;
    const ny    = state.playerY + dy;

    // マップ端チェック
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return;

    const tileId = _getTile(nx, ny);

    // 通行不可チェック
    if (!GameData.PASSABLE[tileId]) return;

    // 宝箱・ボス・扉チェック（移動先）
    const ev = _getEvent(nx, ny);
    if (ev) {
      _handleEvent(ev, nx, ny, dx, dy);
      return;
    }

    // 通常移動
    _movePlayer(nx, ny);
  }

  // ── プレイヤー移動（アニメ付き） ─────────────────────────
  function _movePlayer(nx, ny) {
    state.moving    = true;
    state.playerX   = nx;
    state.playerY   = ny;
    state.walkFrame = 1 - state.walkFrame; // 歩行フレーム切り替え
    _centerCamera();
    render();

    setTimeout(() => {
      state.moving = false;
      _afterMove();
    }, 120);
  }

  function _afterMove() {
    const map    = _currentMap();
    const tileId = _getTile(state.playerX, state.playerY);

    // ダンジョン内たいまつ消費
    if (map.isDungeon && !_isDungeonBossCleared()) {
      if (state.torchLife > 0) {
        state.torchLife--;
        if (state.torchLife === 0) {
          // 消えた → 予備があれば自動点火
          if (!_tryLightTorch(false)) {
            UI.showMessage('たいまつが　きえてしまった！', null);
          }
        }
        render(); // 明るさ更新
      }
    }

    // フィールド毒ダメージ（毎歩1ダメージ）
    if (Game.isPoisoned()) {
      Game.takeDamage(1);
      if (Game.getPlayer().hp <= 0) {
        // 毒死→復活
        UI.showMessage('どくで　たおれてしまった…', () => {
          Game.revive();
          Game.setPoison(false);
          loadMap('throne_room', 4, 8);
          UI.showNpcDialog([
            'おお　でこやまよ。\nどくには　きをつけよ。',
          ]);
        });
        return;
      }
    }

    // エンカウント判定
    if (GameData.ENCOUNTER_TILES.includes(tileId)) {
      const rate = map.encounter_rate || 0;
      state.stepCount++;
      // 4歩以上歩いたら確率エンカウント
      if (state.stepCount >= 4 && Math.random() < rate) {
        state.stepCount = 0;
        _triggerEncounter();
        return;
      }
    }
  }

  // ── たいまつ点火 ─────────────────────────────────────────
  function _tryLightTorch(isEntry) {
    const player = Game.getPlayer();
    if (player.items.includes('torch')) {
      Game.removeItem('torch');
      state.torchLife = TORCH_MAX;
      if (!isEntry) {
        UI.showMessage('つぎの　たいまつに\nひをつけた！', null);
      }
      return true;
    }
    state.torchLife = 0;
    if (isEntry) {
      // 入った時にたいまつがない警告は少し遅延
      setTimeout(() => {
        UI.showMessage('たいまつがない！\nまっくらだ…', null);
      }, 400);
    }
    return false;
  }

  // ── ダンジョンボス撃破チェック ───────────────────────────
  function _isDungeonBossCleared() {
    const map = _currentMap();
    if (!map.events) return false;
    for (const ev of map.events) {
      if (ev.type === 'boss' && state.clearedBoss[ev.bossId]) return true;
    }
    return false;
  }

  function _triggerEncounter() {
    const map     = _currentMap();
    const pLv = Game.getPlayer().level;
    const enemies = Object.values(GameData.ENEMIES).filter(e =>
      e.area && e.area.includes(map.id) && !e.isBoss &&
      (!e.minLv || pLv >= e.minLv - 2)
    );
    if (enemies.length === 0) return;
    const enemy = enemies[Math.floor(Math.random() * enemies.length)];
    // Battleモジュールへ委譲
    if (typeof Battle !== 'undefined') {
      Battle.start(enemy, false);
    }
  }

  // ── イベント処理 ──────────────────────────────────────────
  function _handleEvent(ev, nx, ny, dx, dy) {
    switch (ev.type) {

      case 'teleport':
        // ボス撃破が必要なエリアのチェック（魔王城）
        if (ev.requiresBoss) {
          if (!state.clearedBoss[ev.requiresBoss]) {
            UI.showMessage('やみの　ちからが　はばんでいる…\nまのとうの　ちゅうボスを\nたおさなければ　すすめない。', null);
            return;
          }
        }
        // 鍵が必要なエリアのチェック
        if (ev.requiresItem) {
          const player = Game.getPlayer();
          const hasItem = player.items.includes(ev.requiresItem) ||
                          player.weapon === ev.requiresItem;
          if (!hasItem) {
            const itemName = GameData.ITEMS[ev.requiresItem]
              ? GameData.ITEMS[ev.requiresItem].name : ev.requiresItem;
            UI.showMessage(`とびらに　かぎがかかっている！\n${itemName}が　ひつようだ。`);
            return;
          }
        }
        _movePlayer(nx, ny);
        setTimeout(() => {
          loadMap(ev.dest, ev.destX, ev.destY);
          if (typeof UI !== 'undefined') {
            Sound.teleport();
            UI.showMessage(_mapTransitionMsg(ev.dest));
          }
        }, 200);
        break;

      case 'chest': {
        const chestKey = `${state.currentMapId}_${nx}_${ny}`;
        if (state.openedChests[chestKey]) {
          _movePlayer(nx, ny);
          if (typeof UI !== 'undefined') UI.showMessage('からっぽだ。');
          return;
        }
        state.openedChests[chestKey] = true;
        _movePlayer(nx, ny);
        const item = GameData.ITEMS[ev.item];
        if (typeof Game !== 'undefined') Game.addItem(ev.item);
        if (typeof UI !== 'undefined') {
          Sound.chest();
          let msg = `たからばこをあけた！\n${item.name}を てにいれた！`;
          // 鍵アイテムには用途ヒントを追加
          if (ev.item === 'iron_key') {
            msg += '\nまのとうの　とびらが\nあけられるかもしれない…';
          } else if (ev.item === 'holy_sword') {
            msg += '\nこれで　まおうにも\nたちむかえるだろう！';
          }
          UI.showMessage(msg);
        }
        _setTile(nx, ny, GameData.TILE.FLOOR);
        render();
        break;
      }

      case 'boss': {
        if (state.clearedBoss[ev.bossId]) {
          // ボス撃破済み→対応する姫イベントへ
          if (ev.bossId === 'maou') {
            const princessEv = _getEventByNpcId('princess');
            if (princessEv && typeof UI !== 'undefined') {
              UI.showNpcDialog(GameData.NPC.princess);
            }
          }
          _movePlayer(nx, ny);
          return;
        }
        _movePlayer(nx, ny);
        const bossData = GameData.ENEMIES[ev.bossId];
        setTimeout(() => {
          if (typeof Battle !== 'undefined') {
            Battle.start(bossData, true, ev.bossId);
          }
        }, 200);
        break;
      }

      case 'princess':
        if (state.clearedBoss['maou']) {
          _movePlayer(nx, ny);
          if (typeof UI !== 'undefined') {
            UI.showNpcDialog(GameData.NPC.princess, () => {
              if (typeof Game !== 'undefined') Game.startEnding();
            });
          }
        }
        break;

      case 'npc': {
        // レベル制限チェック
        if (ev.minLevel && Game.getPlayer().level < ev.minLevel) {
          // まだレベルが足りない → 無視（通過）
          _movePlayer(nx, ny);
          return;
        }
        _movePlayer(nx, ny);
        setTimeout(() => {
          if (typeof UI !== 'undefined' && typeof Game !== 'undefined') {
            if (ev.npcId === 'king') {
              const kd = Game.getKingDialog();
              UI.showNpcDialog(kd.lines, kd.onClose);
            } else if (ev.npcId === 'queen') {
              const qd = Game.getQueenDialog();
              UI.showNpcDialog(qd.lines, qd.onClose);
            } else if (ev.npcId === 'adventurer') {
              if (!Game.isSpellDoubled()) {
                UI.showNpcDialog(GameData.NPC.adventurer, () => {
                  Game.doubleSpellPower();
                  UI.showMessage('じゅもんの　ちからが\n２ばいに　なった！', null);
                });
              } else {
                UI.showNpcDialog(['またきたか　ゆうしゃよ。\nはやく　まおうを　たおせ！'], null);
              }
            } else {
              const lines = GameData.NPC[ev.npcId];
              if (lines) UI.showNpcDialog(lines);
            }
          }
        }, 150);
        break;
      }

      case 'inn':
        _movePlayer(nx, ny);
        setTimeout(() => {
          if (typeof Game !== 'undefined') Game.useInn(ev.cost);
        }, 150);
        break;

      case 'shop':
        _movePlayer(nx, ny);
        setTimeout(() => {
          if (typeof Game !== 'undefined') Game.openShop(ev.shopId);
        }, 150);
        break;

      default:
        _movePlayer(nx, ny);
    }
  }

  function _mapTransitionMsg(dest) {
    const map = GameData.MAPS[dest];
    return map ? `${map.name}に　はいった。` : '';
  }

  // ── ボスクリア登録 ────────────────────────────────────────
  function setBossCleared(bossId) {
    state.clearedBoss[bossId] = true;

    // ボス撃破後：イベント座標のタイルを変える（消す）
    const map = _currentMap();
    map.events.forEach(ev => {
      if (ev.bossId === bossId) {
        _setTile(ev.x, ev.y, GameData.TILE.FLOOR);
      }
    });
    render();
  }

  function isBossCleared(bossId) {
    return !!state.clearedBoss[bossId];
  }

  // ── 描画 ─────────────────────────────────────────────────
  function render() {
    if (!ctx || !canvas) return;
    const map      = _currentMap();
    const tileSize = canvas.width / VIEW_W;
    const viewH    = _getViewH();   // キャンバス全体を埋める実際の行数

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < viewH; row++) {
      for (let col = 0; col < VIEW_W; col++) {
        const mx = state.cameraX + col;
        const my = state.cameraY + row;
        if (mx < 0 || my < 0 || mx >= map.width || my >= map.height) {
          // マップ外は暗い霧色（純黒を避ける）
          ctx.fillStyle = '#0a0a1e';
          ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
          continue;
        }
        const tileId = _getTile(mx, my);
        _drawTile(ctx, col * tileSize, row * tileSize, tileSize, tileId, mx, my);
      }
    }

    // イベントスプライト描画
    if (map.events) {
      map.events.forEach(ev => {
        const ex = ev.x - state.cameraX;
        const ey = ev.y - state.cameraY;
        // ビュー外はスキップ
        if (ex < 0 || ey < 0 || ex >= VIEW_W || ey >= viewH) return;
        const sx = ex * tileSize;
        const sy = ey * tileSize;

        switch (ev.type) {
          case 'npc': {
            // レベル制限があるNPCは条件チェック
            if (ev.minLevel && Game.getPlayer().level < ev.minLevel) break;
            if (ev.npcId === 'king') {
              _drawKingIcon(ctx, sx, sy, tileSize);
            } else if (ev.npcId === 'queen') {
              _drawQueenIcon(ctx, sx, sy, tileSize);
            } else if (ev.npcId === 'adventurer') {
              _drawAdventurerIcon(ctx, sx, sy, tileSize);
            } else if (ev.npcId === 'guard1' || ev.npcId === 'guard2') {
              _drawGuardIcon(ctx, sx, sy, tileSize);
            } else {
              _drawNpcIcon(ctx, sx, sy, tileSize);
            }
            break;
          }
          case 'teleport': {
            const d = ev.dest || '';
            if (d === 'castle_town' || d === 'throne_room') {
              _drawCastleIcon(ctx, sx, sy, tileSize);
            } else if (d === 'maou_castle') {
              if (state.clearedBoss['dungeon2_boss']) {
                _drawDarkCastleIcon(ctx, sx, sy, tileSize);
              }
              // 魔王城は dungeon2_boss 撃破前は表示しない
            } else if (d === 'dungeon1') {
              _drawCaveIcon(ctx, sx, sy, tileSize);
            } else if (d === 'dungeon2') {
              _drawTowerIcon(ctx, sx, sy, tileSize);
            } else if (d === 'desert_town') {
              _drawDesertTownIcon(ctx, sx, sy, tileSize);
            } else {
              _drawBuildingIcon(ctx, sx, sy, tileSize);
            }
            break;
          }
          case 'boss':
            if (!state.clearedBoss[ev.bossId]) {
              _drawBossIcon(ctx, sx, sy, tileSize);
            }
            break;
          case 'chest': {
            const chestKey = `${state.currentMapId}_${ev.x}_${ev.y}`;
            if (!state.openedChests[chestKey]) {
              _drawChestIcon(ctx, sx, sy, tileSize);
            }
            break;
          }
          case 'inn':
            _drawInnIcon(ctx, sx, sy, tileSize);
            break;
          case 'shop':
            _drawShopIcon(ctx, sx, sy, tileSize);
            break;
          case 'princess':
            _drawPrincessIcon(ctx, sx, sy, tileSize);
            break;
        }
      });
    }

    // プレイヤー描画（歩行アニメ：フレーム交互で左右反転）
    const px = (state.playerX - state.cameraX) * tileSize;
    const py = (state.playerY - state.cameraY) * tileSize;
    _drawPlayer(ctx, px, py, tileSize, state.walkFrame === 1);

    // ダンジョン暗闇オーバーレイ
    if (map.isDungeon && !_isDungeonBossCleared()) {
      _renderDarkness(tileSize, viewH);
    }
  }

  // ── 暗闇描画 ─────────────────────────────────────────────
  function _renderDarkness(tileSize, viewH) {
    // たいまつの明るさ半径（タイル単位）
    const radius = state.torchLife > 0
      ? 1.0 + 1.8 * (state.torchLife / TORCH_MAX)  // 1.0〜2.8（控えめな照明）
      : 0.5;                                        // たいまつなし：足元のみ

    for (let row = 0; row < viewH; row++) {
      for (let col = 0; col < VIEW_W; col++) {
        const mx = state.cameraX + col;
        const my = state.cameraY + row;
        const dx = mx - state.playerX;
        const dy = my - state.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let alpha;
        if (dist <= radius - 0.5) {
          alpha = 0;                              // 明るい
        } else if (dist <= radius + 0.5) {
          alpha = (dist - radius + 0.5);          // グラデーション
        } else {
          alpha = 1;                              // 真っ暗
        }

        if (alpha > 0) {
          ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha)})`;
          ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
        }
      }
    }
  }

  function _drawTile(ctx, x, y, size, tileId, mx, my) {
    const mapId = state.currentMapId;

    // マップ別の特殊タイル描画
    if (mapId === 'dungeon1') {
      _drawDungeon1Tile(ctx, x, y, size, tileId, mx, my);
      return;
    }
    if (mapId === 'dungeon2') {
      _drawDungeon2Tile(ctx, x, y, size, tileId, mx, my);
      return;
    }
    if (mapId === 'maou_castle') {
      _drawMaouCastleTile(ctx, x, y, size, tileId, mx, my);
      return;
    }
    if (mapId === 'desert_town') {
      _drawDesertTownTile(ctx, x, y, size, tileId, mx, my);
      return;
    }
    if (mapId === 'castle_town' || mapId === 'throne_room') {
      _drawCastleTile(ctx, x, y, size, tileId, mx, my);
      return;
    }
    if (mapId === 'world') {
      _drawWorldTile(ctx, x, y, size, tileId, mx, my);
      return;
    }

    // デフォルト描画
    _drawDefaultTile(ctx, x, y, size, tileId);
  }

  function _drawDefaultTile(ctx, x, y, size, tileId) {
    // 背景色
    ctx.fillStyle = GameData.TILE_COLOR[tileId] || '#000';
    ctx.fillRect(x, y, size, size);

    // タイル枠（グリッド感）
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, size, size);

    // タイル記号
    const ch = GameData.TILE_CHAR[tileId];
    if (ch) {
      ctx.fillStyle   = 'rgba(255,255,255,0.7)';
      ctx.font        = `bold ${Math.floor(size * 0.45)}px 'DotGothic16', monospace`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, x + size / 2, y + size / 2);
    }

    // 宝箱・階段は追加アイコン
    if (tileId === GameData.TILE.CHEST) {
      _drawChestIcon(ctx, x, y, size);
    }
    if (tileId === GameData.TILE.STAIR) {
      _drawStairIcon(ctx, x, y, size);
    }
  }

  // ── タイル共通シード疑似乱数 ─────────────────────────────────
  function _tileRand(seed, mul) {
    return ((seed * mul + 2531011) & 0x7fffffff) / 0x7fffffff;
  }

  // ── ダンジョン1（草の洞窟）タイル ────────────────────────────
  function _drawDungeon1Tile(ctx, x, y, size, tileId, mx, my) {
    const T = GameData.TILE;
    const s = size;
    const seed = mx * 37 + my * 13;
    const r1 = _tileRand(seed, 1103515245);
    const r2 = _tileRand(seed, 214013);
    const r3 = _tileRand(seed + 7, 1664525);

    if (tileId === T.WALL) {
      // ベース：暗い岩盤
      ctx.fillStyle = '#141e0e';
      ctx.fillRect(x, y, s, s);

      // 岩石ブロック（不規則な石積み）
      const blockH = s * (0.45 + r1 * 0.15);
      ctx.fillStyle = '#1c2a14';
      ctx.fillRect(x + 1, y + 1, s * (0.55 + r2 * 0.3), blockH - 1);
      ctx.fillStyle = '#162010';
      ctx.fillRect(x + 1, y + blockH + 1, s - 2, s - blockH - 2);

      // 石の稜線ハイライト
      ctx.fillStyle = 'rgba(80,100,60,0.55)';
      ctx.fillRect(x + 1, y + 1, s - 2, 2);
      ctx.fillRect(x + 1, y + blockH + 1, s * (0.4 + r1 * 0.4), 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 1, y + blockH - 1, s - 2, 2);

      // 苔（明るい緑パッチ）
      const mossX = x + r2 * s * 0.6 + s * 0.1;
      const mossY = y + r1 * s * 0.5 + s * 0.1;
      const mg = ctx.createRadialGradient(mossX + s*0.06, mossY + s*0.04, 0, mossX + s*0.06, mossY + s*0.04, s*0.18);
      mg.addColorStop(0, 'rgba(50,110,30,0.75)');
      mg.addColorStop(1, 'rgba(20,60,10,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mossX, mossY, s*0.32, s*0.25);
      if (r3 > 0.45) {
        const m2x = x + (1-r2)*s*0.55 + s*0.05;
        ctx.fillStyle = 'rgba(45,95,25,0.5)';
        ctx.fillRect(m2x, y + r3*s*0.6 + s*0.05, s*0.18, s*0.15);
      }

      // 垂直ひび
      ctx.strokeStyle = `rgba(8,14,5,${0.6 + r3*0.35})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + r2*s*0.7 + s*0.1, y);
      ctx.lineTo(x + r3*s*0.6 + s*0.15, y + s*(0.4 + r1*0.3));
      ctx.stroke();

      // 水滴しみ（水が染み出る感じ）
      if (r1 > 0.6) {
        ctx.fillStyle = 'rgba(30,60,20,0.35)';
        ctx.fillRect(x + r3*s*0.5 + s*0.2, y + s*0.6, s*0.08, s*0.35);
      }

    } else if (tileId === T.FLOOR) {
      // ベース：暗い土床
      const shade = 0.68 + r1 * 0.22;
      ctx.fillStyle = `rgb(${Math.floor(38*shade)},${Math.floor(46*shade)},${Math.floor(30*shade)})`;
      ctx.fillRect(x, y, s, s);

      // 石畳ブロック境界（ランダムに2分割）
      const split = r2 > 0.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      if (split) {
        ctx.strokeRect(x + 1.5, y + 1.5, s * 0.5 - 2, s - 3);
        ctx.strokeRect(x + s * 0.5 + 0.5, y + 1.5, s * 0.5 - 2, s - 3);
      } else {
        ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s * 0.5 - 2);
        ctx.strokeRect(x + 1.5, y + s * 0.5 + 0.5, s - 3, s * 0.5 - 2);
      }
      // 石のハイライト
      ctx.fillStyle = 'rgba(80,100,60,0.2)';
      ctx.fillRect(x + 2, y + 2, (split ? s*0.5-4 : s-4), 2);

      // 草の芽（ひび割れから生える）
      if (r2 > 0.55) {
        const gx = x + r1*s*0.7 + s*0.05;
        const gy = y + s*0.42;
        ctx.fillStyle = '#3a8022';
        ctx.fillRect(gx,       gy,        s*0.05, s*0.30);
        ctx.fillRect(gx-s*0.04, gy+s*0.06, s*0.05, s*0.18);
        ctx.fillRect(gx+s*0.04, gy+s*0.10, s*0.05, s*0.20);
        // 葉先（三角）
        ctx.fillStyle = '#4aaa28';
        ctx.beginPath();
        ctx.moveTo(gx + s*0.025, gy - s*0.05);
        ctx.lineTo(gx - s*0.04,  gy + s*0.04);
        ctx.lineTo(gx + s*0.09,  gy + s*0.02);
        ctx.fill();
      }
      // 小石
      if (r3 > 0.65) {
        ctx.fillStyle = 'rgba(50,60,40,0.7)';
        ctx.beginPath();
        ctx.ellipse(x + r2*s*0.8+s*0.05, y + r3*s*0.7+s*0.1, s*0.06, s*0.04, r1*Math.PI, 0, Math.PI*2);
        ctx.fill();
      }

    } else if (tileId === T.STAIR) {
      ctx.fillStyle = '#2a3a20';
      ctx.fillRect(x, y, s, s);
      _drawStairIcon(ctx, x, y, s);
    } else if (tileId === T.CHEST) {
      ctx.fillStyle = '#2a3a20';
      ctx.fillRect(x, y, s, s);
      _drawChestIcon(ctx, x, y, s);
    } else {
      _drawDefaultTile(ctx, x, y, s, tileId);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, s, s);
  }

  // ── ダンジョン2（魔の塔）タイル ─────────────────────────────
  function _drawDungeon2Tile(ctx, x, y, size, tileId, mx, my) {
    const T = GameData.TILE;
    const s = size;
    const seed = mx * 53 + my * 17;
    const r1 = _tileRand(seed, 1103515245);
    const r2 = _tileRand(seed, 214013);
    const r3 = _tileRand(seed + 11, 1664525);

    if (tileId === T.WALL) {
      // ベース：深い暗紫石
      ctx.fillStyle = '#0e0818';
      ctx.fillRect(x, y, s, s);

      // 切り石ブロック（整然とした塔の石積み）
      const blockH = s * 0.5;
      const blockOffset = (my % 2 === 0) ? 0 : s * 0.5;
      ctx.fillStyle = '#160c26';
      ctx.fillRect(x + 1, y + 1, s * 0.6 - 1, blockH - 1);
      ctx.fillRect(x + s*0.6 + 1, y + 1, s*0.4 - 2, blockH - 1);
      ctx.fillStyle = '#120a20';
      ctx.fillRect(x + blockOffset + 1, y + blockH + 1, s * 0.55 - 1, blockH - 2);
      ctx.fillRect(x + blockOffset + s*0.55 + 1, y + blockH + 1, s * 0.45 - 2, blockH - 2);

      // 石の稜線
      ctx.fillStyle = 'rgba(100,70,180,0.4)';
      ctx.fillRect(x + 1, y + 1, s - 2, 1.5);
      ctx.fillRect(x + 1, y + blockH, s - 2, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x + 1, y + blockH - 1.5, s - 2, 1.5);

      // 魔法ルーン（刻まれた文字）
      if (r1 > 0.5) {
        ctx.strokeStyle = `rgba(120,80,220,${0.25 + r2*0.35})`;
        ctx.lineWidth = 1.0;
        const rx = x + r2*s*0.55 + s*0.12;
        const ry = y + r1*s*0.40 + s*0.10;
        // ルーン記号（簡易）
        ctx.beginPath();
        ctx.moveTo(rx, ry); ctx.lineTo(rx + s*0.12, ry + s*0.14);
        ctx.moveTo(rx + s*0.06, ry); ctx.lineTo(rx + s*0.06, ry + s*0.18);
        ctx.moveTo(rx, ry + s*0.08); ctx.lineTo(rx + s*0.12, ry + s*0.08);
        ctx.stroke();
      }

      // 魔力結晶（壁に埋め込まれた光る石）
      if (r3 > 0.72) {
        const cx2 = x + r2*s*0.7 + s*0.1;
        const cy2 = y + r3*s*0.5 + s*0.1;
        const crystalGlow = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, s*0.10);
        crystalGlow.addColorStop(0, 'rgba(160,100,255,0.9)');
        crystalGlow.addColorStop(0.5, 'rgba(80,40,180,0.4)');
        crystalGlow.addColorStop(1, 'rgba(40,10,80,0)');
        ctx.fillStyle = crystalGlow;
        ctx.beginPath();
        ctx.arc(cx2, cy2, s*0.10, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'rgba(220,180,255,0.95)';
        ctx.fillRect(cx2 - s*0.025, cy2 - s*0.025, s*0.05, s*0.05);
      }

    } else if (tileId === T.FLOOR) {
      // ベース：暗青紫の磨かれた石板
      const shade = 0.7 + r1 * 0.3;
      ctx.fillStyle = `rgb(${Math.floor(18*shade)},${Math.floor(14*shade)},${Math.floor(40*shade)})`;
      ctx.fillRect(x, y, s, s);

      // 大きな石板（市松模様気味）
      const checker = (mx + my) % 2 === 0;
      ctx.fillStyle = checker ? 'rgba(30,20,60,0.6)' : 'rgba(10,8,28,0.6)';
      ctx.fillRect(x + 2, y + 2, s - 4, s - 4);

      // 石板目地
      ctx.strokeStyle = 'rgba(70,50,140,0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);

      // 光る魔法陣の一部（複数タイルにまたがる大きな魔法陣の断片）
      const circlePhase = (mx % 4) * 0.5 + (my % 4) * 0.125;
      if ((mx % 3 === 1) && (my % 3 === 1)) {
        ctx.strokeStyle = 'rgba(140,90,255,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x + s*0.5, y + s*0.5, s*0.4, 0, Math.PI*2);
        ctx.stroke();
        // 魔法陣の内側の星
        ctx.strokeStyle = 'rgba(100,60,200,0.4)';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
          const a = (i * 4 / 5) * Math.PI * 2 - Math.PI/2;
          const a2 = ((i+2) * 4 / 5) * Math.PI * 2 - Math.PI/2;
          ctx.beginPath();
          ctx.moveTo(x + s*0.5 + Math.cos(a)*s*0.35, y + s*0.5 + Math.sin(a)*s*0.35);
          ctx.lineTo(x + s*0.5 + Math.cos(a2)*s*0.35, y + s*0.5 + Math.sin(a2)*s*0.35);
          ctx.stroke();
        }
      } else if (r2 > 0.7) {
        // たまに光の筋
        ctx.strokeStyle = `rgba(100,70,200,${0.12 + r3*0.12})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y + r1*s);
        ctx.lineTo(x + s, y + r2*s);
        ctx.stroke();
      }

      // 石板ハイライト（角の光沢）
      ctx.fillStyle = 'rgba(100,80,180,0.12)';
      ctx.fillRect(x + 2, y + 2, s - 4, 2);
      ctx.fillRect(x + 2, y + 2, 2, s - 4);

    } else if (tileId === T.CHEST) {
      ctx.fillStyle = '#14102a';
      ctx.fillRect(x, y, s, s);
      _drawChestIcon(ctx, x, y, s);
    } else if (tileId === T.STAIR) {
      ctx.fillStyle = '#14102a';
      ctx.fillRect(x, y, s, s);
      _drawStairIcon(ctx, x, y, s);
    } else {
      _drawDefaultTile(ctx, x, y, s, tileId);
    }
    ctx.strokeStyle = 'rgba(40,0,80,0.25)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, s, s);
  }

  // ── 魔王城タイル ─────────────────────────────────────────────
  function _drawMaouCastleTile(ctx, x, y, size, tileId, mx, my) {
    const T = GameData.TILE;
    const s = size;
    const seed = mx * 71 + my * 29;
    const r1 = _tileRand(seed, 1103515245);
    const r2 = _tileRand(seed, 214013);
    const r3 = _tileRand(seed + 5, 1664525);

    if (tileId === T.WALL) {
      // ベース：漆黒の石
      ctx.fillStyle = '#100404';
      ctx.fillRect(x, y, s, s);

      // 石ブロック（暗赤で積まれた城壁）
      const blockH = s * 0.48;
      const blockOff = (my % 2 === 0) ? 0 : s * 0.45;
      ctx.fillStyle = '#1a0606';
      ctx.fillRect(x + 1, y + 1, s * 0.58 - 1, blockH - 1);
      ctx.fillRect(x + s*0.58 + 1, y + 1, s*0.42 - 2, blockH - 1);
      ctx.fillStyle = '#160404';
      ctx.fillRect(x + blockOff + 1, y + blockH + 1, s * 0.52 - 1, blockH - 2);

      // 石の稜線（微かな暗赤）
      ctx.fillStyle = 'rgba(100,20,20,0.45)';
      ctx.fillRect(x + 1, y + 1, s - 2, 1.5);
      ctx.fillRect(x + 1, y + blockH, s - 2, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x + 1, y + blockH - 1.5, s - 2, 1.5);
      ctx.fillRect(x + s - 2.5, y + 1, 1.5, s - 2);

      // 血の染み・垂れ
      if (r1 > 0.45) {
        const bx = x + r2*s*0.7 + s*0.05;
        ctx.fillStyle = `rgba(140,10,10,${0.25 + r3*0.3})`;
        ctx.fillRect(bx, y + r1*s*0.2, s*0.06, s*(0.35 + r3*0.3));
        // 垂れの先端（しずく形）
        ctx.beginPath();
        ctx.arc(bx + s*0.03, y + r1*s*0.2 + s*(0.35+r3*0.3), s*0.04, 0, Math.PI*2);
        ctx.fill();
      }

      // 骨のような白い筋（魔王城の装飾）
      if (r3 > 0.78) {
        ctx.fillStyle = 'rgba(60,40,40,0.5)';
        ctx.fillRect(x + r2*s*0.6 + s*0.1, y + r3*s*0.3, s*0.04, s*0.30);
        ctx.fillRect(x + r2*s*0.4 + s*0.1, y + r3*s*0.3 + s*0.25, s*0.14, s*0.04);
      }

    } else if (tileId === T.FLOOR) {
      // ベース：黒みがかった血石
      const shade = 0.65 + r1 * 0.35;
      ctx.fillStyle = `rgb(${Math.floor(32*shade)},${Math.floor(10*shade)},${Math.floor(10*shade)})`;
      ctx.fillRect(x, y, s, s);

      // 大石板（暗い市松）
      const checker = (mx + my) % 2 === 0;
      ctx.fillStyle = checker ? 'rgba(50,8,8,0.7)' : 'rgba(20,4,4,0.7)';
      ctx.fillRect(x + 2, y + 2, s - 4, s - 4);

      // 石板の目地（暗赤）
      ctx.strokeStyle = 'rgba(80,15,15,0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);

      // 石板ハイライト（血の光沢）
      ctx.fillStyle = 'rgba(100,18,18,0.18)';
      ctx.fillRect(x + 2, y + 2, s - 4, 2);

      // 血痕（大きめ）
      if (r1 > 0.75) {
        const bpx = x + r2*s*0.5 + s*0.1;
        const bpy = y + r3*s*0.4 + s*0.1;
        const bloodGrad = ctx.createRadialGradient(bpx, bpy, 0, bpx, bpy, s*0.18);
        bloodGrad.addColorStop(0, 'rgba(160,10,10,0.6)');
        bloodGrad.addColorStop(1, 'rgba(80,4,4,0)');
        ctx.fillStyle = bloodGrad;
        ctx.beginPath();
        ctx.ellipse(bpx, bpy, s*0.18, s*0.12, r1*Math.PI, 0, Math.PI*2);
        ctx.fill();
      }

      // 赤く光るひびわれ（魔力が漏れる）
      if (r2 > 0.80) {
        ctx.strokeStyle = `rgba(200,40,0,${0.2 + r3*0.25})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + r3*s*0.4, y + r1*s*0.3);
        ctx.lineTo(x + r2*s*0.8 + s*0.05, y + r3*s*0.7 + s*0.1);
        ctx.stroke();
      }

    } else if (tileId === T.STAIR) {
      ctx.fillStyle = '#1a0606';
      ctx.fillRect(x, y, s, s);
      _drawStairIcon(ctx, x, y, s);
    } else {
      _drawDefaultTile(ctx, x, y, s, tileId);
    }
    ctx.strokeStyle = 'rgba(50,0,0,0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, s, s);
  }

  // ── 荒野の町タイル ───────────────────────────────────────────
  function _drawDesertTownTile(ctx, x, y, size, tileId, mx, my) {
    const T = GameData.TILE;
    const s = size;
    const seed = mx * 41 + my * 19;
    const r1 = _tileRand(seed, 1103515245);
    const r2 = _tileRand(seed, 214013);
    const r3 = _tileRand(seed + 3, 1664525);

    if (tileId === T.WALL) {
      // 日干しレンガの壁（アドビ）
      ctx.fillStyle = '#6a4c1c';
      ctx.fillRect(x, y, s, s);

      // レンガコース（本物らしい交互積み）
      const bh = Math.floor(s / 3.5);
      for (let row = 0; row < 4; row++) {
        const oy = row * bh;
        const offset = (row % 2) * Math.floor(s * 0.40);
        const brickCol0 = row % 2 === 0 ? '#7a5a28' : '#6e5222';
        const brickCol1 = row % 2 === 0 ? '#6e5222' : '#7a5a28';
        // 左レンガ
        ctx.fillStyle = brickCol0;
        ctx.fillRect(x - offset + 1, y + oy + 1, s * 0.55 - 1, bh - 2);
        // 右レンガ
        ctx.fillStyle = brickCol1;
        ctx.fillRect(x - offset + s*0.55 + 1, y + oy + 1, s * 0.55 - 1, bh - 2);
        // 目地（暗い線）
        ctx.fillStyle = '#4a3212';
        ctx.fillRect(x, y + oy, s, 1);
        // ハイライト（上面）
        ctx.fillStyle = 'rgba(220,180,100,0.18)';
        ctx.fillRect(x - offset + 1, y + oy + 1, s * 0.55 - 1, 2);
      }
      // 左側の影
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + s - 3, y, 3, s);

    } else if (tileId === T.SAND || tileId === T.FLOOR) {
      // 砂床ベース
      const isSand = tileId === T.SAND;
      const baseShade = 0.82 + r1 * 0.18;
      const br = isSand ? 210 : 170, bg = isSand ? 175 : 145, bb = isSand ? 80 : 105;
      ctx.fillStyle = `rgb(${Math.floor(br*baseShade)},${Math.floor(bg*baseShade)},${Math.floor(bb*baseShade)})`;
      ctx.fillRect(x, y, s, s);

      // 砂紋（風紋：細い曲線状の波）
      if (isSand) {
        ctx.strokeStyle = `rgba(${Math.floor(br*0.85)},${Math.floor(bg*0.75)},${Math.floor(bb*0.7)},0.55)`;
        ctx.lineWidth = 0.7;
        const waveY = y + r2*s*0.4 + s*0.15;
        ctx.beginPath();
        ctx.moveTo(x, waveY);
        ctx.quadraticCurveTo(x + s*0.5, waveY - s*0.06*r3, x + s, waveY + s*0.04);
        ctx.stroke();
        const waveY2 = waveY + s*(0.25 + r1*0.15);
        ctx.beginPath();
        ctx.moveTo(x, waveY2);
        ctx.quadraticCurveTo(x + s*0.5, waveY2 + s*0.05*r3, x + s, waveY2 - s*0.03);
        ctx.stroke();
      }

      // 砂粒のドット（細かいテクスチャ）
      const dotColor = `rgba(${Math.floor(br*0.75)},${Math.floor(bg*0.7)},${Math.floor(bb*0.6)},0.7)`;
      ctx.fillStyle = dotColor;
      ctx.fillRect(x + r1*s*0.85, y + r2*s*0.75, s*0.05, s*0.05);
      ctx.fillRect(x + r2*s*0.55, y + r3*s*0.45, s*0.04, s*0.04);
      ctx.fillRect(x + r3*s*0.25, y + r1*s*0.82, s*0.04, s*0.04);
      ctx.fillRect(x + r1*s*0.35 + s*0.3, y + r2*s*0.20 + s*0.4, s*0.03, s*0.03);

      // 右下に影（立体感）
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, y + s*0.8, s, s*0.2);

    } else if (tileId === T.TOWN) {
      // 建物壁タイル（アドビ外壁）
      ctx.fillStyle = '#7a5a28';
      ctx.fillRect(x, y, s, s);
      // 日光の当たった面（明るいトップ）
      ctx.fillStyle = '#9a7038';
      ctx.fillRect(x, y, s, s*0.25);
      // 窓の影（暗い凹み）
      ctx.fillStyle = '#3a2808';
      ctx.fillRect(x + s*0.2, y + s*0.35, s*0.6, s*0.4);
      // 窓枠
      ctx.fillStyle = '#8a6030';
      ctx.fillRect(x + s*0.18, y + s*0.33, s*0.64, s*0.04);
      ctx.fillRect(x + s*0.18, y + s*0.33, s*0.04, s*0.44);
      ctx.fillRect(x + s*0.78, y + s*0.33, s*0.04, s*0.44);
    } else {
      _drawDefaultTile(ctx, x, y, s, tileId);
      return;
    }
    ctx.strokeStyle = 'rgba(80,50,10,0.22)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, s, s);
    if (tileId === T.CHEST) _drawChestIcon(ctx, x, y, s);
    if (tileId === T.STAIR) _drawStairIcon(ctx, x, y, s);
  }

  // ── 城（castle_town / throne_room）タイル ───────────────────
  function _drawCastleTile(ctx, x, y, size, tileId, mx, my) {
    const T = GameData.TILE;
    const s = size;
    const seed = mx * 43 + my * 23;
    const r1 = _tileRand(seed, 1103515245);
    const r2 = _tileRand(seed, 214013);
    const r3 = _tileRand(seed + 9, 1664525);
    const isThroneRoom = state.currentMapId === 'throne_room';

    if (tileId === T.WALL) {
      // 城壁：整然とした切り石積み
      ctx.fillStyle = '#2a2a38';
      ctx.fillRect(x, y, s, s);

      // 石積みブロック（規則正しい城壁）
      const bh = s * 0.5;
      const blockOff = (my % 2 === 0) ? 0 : s * 0.5;
      // 上段ブロック
      ctx.fillStyle = '#333344';
      ctx.fillRect(x + 1, y + 1, s * 0.60 - 1, bh - 1);
      ctx.fillStyle = '#2e2e3e';
      ctx.fillRect(x + s*0.60 + 1, y + 1, s*0.40 - 2, bh - 1);
      // 下段ブロック（オフセット）
      ctx.fillStyle = '#2e2e40';
      ctx.fillRect(x + blockOff + 1, y + bh + 1, s * 0.55 - 1, bh - 2);
      ctx.fillStyle = '#282838';
      ctx.fillRect(x + blockOff + s*0.55 + 1, y + bh + 1, s * 0.45 - 2, bh - 2);

      // 石稜線ハイライト（明るい）
      ctx.fillStyle = 'rgba(160,160,200,0.4)';
      ctx.fillRect(x + 1, y + 1, s - 2, 1.5);
      ctx.fillRect(x + 1, y + bh, s - 2, 1.5);
      ctx.fillRect(x + 1, y + 1, 1.5, bh - 1);
      ctx.fillRect(x + 1, y + bh + 1, 1.5, bh - 2);
      // 影（下・右）
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x + 1, y + bh - 1.5, s - 2, 1.5);
      ctx.fillRect(x + s - 2.5, y + 1, 1.5, s - 2);

      // 王城らしい装飾
      if (isThroneRoom && (mx === 1 || mx === 8)) {
        // 柱の金色縦ライン
        ctx.fillStyle = 'rgba(200,170,60,0.48)';
        ctx.fillRect(x + s*0.43, y, s*0.14, s);
        ctx.fillStyle = 'rgba(220,190,80,0.22)';
        ctx.fillRect(x + s*0.38, y, s*0.24, s);
      } else if (isThroneRoom && my === 0 && (mx === 3 || mx === 6)) {
        // バナー（王旗）
        ctx.fillStyle = '#6611aa';
        ctx.fillRect(x + s*0.30, y + s*0.08, s*0.40, s*0.75);
        ctx.fillStyle = '#8833cc';
        ctx.fillRect(x + s*0.34, y + s*0.08, s*0.14, s*0.65);
        // 旗竿
        ctx.fillStyle = '#cc9900';
        ctx.fillRect(x + s*0.48, y, s*0.04, s*0.10);
        // 王冠紋章
        ctx.fillStyle = '#ddaa00';
        ctx.fillRect(x + s*0.36, y + s*0.25, s*0.28, s*0.06);
        ctx.fillRect(x + s*0.37, y + s*0.18, s*0.07, s*0.09);
        ctx.fillRect(x + s*0.48, y + s*0.15, s*0.07, s*0.12);
        ctx.fillRect(x + s*0.56, y + s*0.18, s*0.07, s*0.09);
      } else if (r1 > 0.65) {
        ctx.fillStyle = 'rgba(180,160,100,0.12)';
        ctx.fillRect(x + r2*s*0.7 + s*0.1, y, s*0.04, s);
      }

    } else if (tileId === T.FLOOR) {
      // 赤じゅうたん（throne_room の中央通路 mx=4,5 / my=3..8）
      const isCarpet = isThroneRoom && mx >= 4 && mx <= 5 && my >= 3 && my <= 8;

      if (isCarpet) {
        // 赤いカーペット本体
        ctx.fillStyle = '#7a0c0c';
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = '#9e1414';
        ctx.fillRect(x + s*0.08, y + s*0.08, s*0.84, s*0.84);
        // 中央のやや明るい赤
        ctx.fillStyle = '#b01a1a';
        ctx.fillRect(x + s*0.18, y + s*0.18, s*0.64, s*0.64);
        // 金の縁取り（外側）
        ctx.strokeStyle = '#ddaa00';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(x + s*0.07, y + s*0.07, s*0.86, s*0.86);
        // 金の縁取り（内側細線）
        ctx.strokeStyle = 'rgba(200,160,30,0.55)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x + s*0.20, y + s*0.20, s*0.60, s*0.60);
        // じゅうたんの繊維感（細い縦線）
        ctx.strokeStyle = 'rgba(90,4,4,0.35)';
        ctx.lineWidth = 0.6;
        for (let fi = 0; fi < 5; fi++) {
          const fx = x + s*(0.14 + fi * 0.16);
          ctx.beginPath();
          ctx.moveTo(fx, y + s*0.09);
          ctx.lineTo(fx, y + s*0.91);
          ctx.stroke();
        }
        // 光沢ハイライト
        ctx.fillStyle = 'rgba(220,60,60,0.12)';
        ctx.fillRect(x + s*0.08, y + s*0.08, s*0.84, s*0.04);
      } else {
        const isLight = (mx + my) % 2 === 0;
        if (isThroneRoom) {
          // 王の間：明るい大理石床（紫がかった白）
          ctx.fillStyle = isLight ? '#dcd4ee' : '#cac0e0';
          ctx.fillRect(x, y, s, s);
          // 大理石の筋
          ctx.strokeStyle = `rgba(${isLight ? '180,165,230' : '150,135,210'},${0.22 + r1*0.20})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x + r2*s, y);
          ctx.quadraticCurveTo(x + r3*s, y + r1*s, x + (1-r2)*s, y + s);
          ctx.stroke();
          // 金の目地
          ctx.strokeStyle = 'rgba(200,170,60,0.55)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
          // 四隅に金の点
          ctx.fillStyle = 'rgba(200,170,60,0.62)';
          ctx.fillRect(x + 1, y + 1, 3, 3);
          ctx.fillRect(x + s - 4, y + 1, 3, 3);
          ctx.fillRect(x + 1, y + s - 4, 3, 3);
          ctx.fillRect(x + s - 4, y + s - 4, 3, 3);
        } else {
          // 城下町：明るい石床（薄いグレー大理石）
          ctx.fillStyle = isLight ? '#d2d2e0' : '#bebece';
          ctx.fillRect(x, y, s, s);
          // 大理石の細かい筋
          ctx.strokeStyle = `rgba(${isLight ? '155,155,185' : '125,125,160'},${0.18 + r1*0.14})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(x, y + r2*s*0.8);
          ctx.quadraticCurveTo(x + r3*s, y + r1*s, x + s, y + (1-r2)*s*0.7 + s*0.15);
          ctx.stroke();
          // 石板目地
          ctx.strokeStyle = 'rgba(60,60,90,0.45)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
        }
        // 床の光沢ハイライト
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 2, y + 2, s - 4, 2);
        ctx.fillRect(x + 2, y + 2, 2, s - 4);
      }

    } else if (tileId === T.TOWN) {
      if (isThroneRoom && my === 3) {
        // ══ 玉座（背もたれ部）──
        const tcx = x + s * 0.5;
        // 台座プラットフォーム（金縁）
        ctx.fillStyle = '#8a6a00';
        ctx.fillRect(x, y, s, s);
        // 金のフレーム外側
        ctx.fillStyle = '#cc9a00';
        ctx.fillRect(x + s*0.06, y + s*0.04, s*0.88, s*0.92);
        // 明るい金縁ライン
        ctx.strokeStyle = '#ffe040';
        ctx.lineWidth = 2.0;
        ctx.strokeRect(x + s*0.06, y + s*0.04, s*0.88, s*0.92);
        // 紫のビロードクッション（背もたれ）
        ctx.fillStyle = '#4a0e99';
        ctx.fillRect(x + s*0.12, y + s*0.08, s*0.76, s*0.82);
        // クッション内側ハイライト（左上）
        ctx.fillStyle = '#6622bb';
        ctx.fillRect(x + s*0.12, y + s*0.08, s*0.76, s*0.07);
        ctx.fillRect(x + s*0.12, y + s*0.08, s*0.07, s*0.72);
        // クッション内側シャドウ（右下）
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.fillRect(x + s*0.12, y + s*0.82, s*0.76, s*0.08);
        ctx.fillRect(x + s*0.81, y + s*0.08, s*0.07, s*0.82);
        // 上部の王冠装飾（3本の突起）
        ctx.fillStyle = '#ffcc22';
        ctx.fillRect(tcx - s*0.24, y - s*0.01, s*0.48, s*0.08);
        ctx.fillRect(tcx - s*0.24, y - s*0.08, s*0.10, s*0.09);
        ctx.fillRect(tcx - s*0.05, y - s*0.13, s*0.10, s*0.14);
        ctx.fillRect(tcx + s*0.14, y - s*0.08, s*0.10, s*0.09);
        // 突起先端の宝石
        ctx.fillStyle = '#ff3344';
        ctx.beginPath();
        ctx.arc(tcx, y - s*0.10, s*0.038, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#ffcc22';
        ctx.beginPath();
        ctx.arc(tcx - s*0.19, y - s*0.05, s*0.026, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tcx + s*0.19, y - s*0.05, s*0.026, 0, Math.PI*2);
        ctx.fill();
        // 肘掛け（両サイド）
        ctx.fillStyle = '#bb8800';
        ctx.fillRect(x + s*0.02, y + s*0.40, s*0.10, s*0.40);
        ctx.fillRect(x + s*0.88, y + s*0.40, s*0.10, s*0.40);
        // 肘掛けハイライト
        ctx.fillStyle = '#ffdd44';
        ctx.fillRect(x + s*0.02, y + s*0.40, s*0.10, s*0.04);
        ctx.fillRect(x + s*0.88, y + s*0.40, s*0.10, s*0.04);

      } else if (isThroneRoom && my === 4) {
        // ══ 玉座（座面・台座部）──
        // 台座ベース（暗い金）
        ctx.fillStyle = '#6a5000';
        ctx.fillRect(x, y, s, s);
        // 座面フレーム（金）
        ctx.fillStyle = '#cc9a00';
        ctx.fillRect(x + s*0.06, y + s*0.04, s*0.88, s*0.56);
        ctx.strokeStyle = '#ffe040';
        ctx.lineWidth = 2.0;
        ctx.strokeRect(x + s*0.06, y + s*0.04, s*0.88, s*0.56);
        // 深紅のクッション（座面）
        ctx.fillStyle = '#881212';
        ctx.fillRect(x + s*0.12, y + s*0.08, s*0.76, s*0.46);
        // クッションハイライト
        ctx.fillStyle = '#aa1e1e';
        ctx.fillRect(x + s*0.12, y + s*0.08, s*0.76, s*0.06);
        ctx.fillRect(x + s*0.12, y + s*0.08, s*0.06, s*0.38);
        // ボタン（中央）
        ctx.fillStyle = '#ffcc22';
        ctx.beginPath();
        ctx.arc(x + s*0.50, y + s*0.30, s*0.048, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#cc9900';
        ctx.beginPath();
        ctx.arc(x + s*0.50, y + s*0.30, s*0.024, 0, Math.PI*2);
        ctx.fill();
        // 台座の段（下部）
        ctx.fillStyle = '#bb8800';
        ctx.fillRect(x, y + s*0.62, s, s*0.38);
        ctx.fillStyle = '#ffdd44';
        ctx.fillRect(x, y + s*0.62, s, s*0.04);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + s*0.96, s, s*0.04);

      } else {
        // 城内建物タイル（石造りの建物壁）
        ctx.fillStyle = '#444455';
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = 'rgba(180,180,220,0.1)';
        ctx.fillRect(x, y, s, s*0.06);
      }
    } else if (tileId === T.ROAD) {
      // 道（石畳の道）
      ctx.fillStyle = '#5a5a40';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
    } else if (tileId === T.STAIR) {
      ctx.fillStyle = isThroneRoom ? '#302848' : '#3a3a50';
      ctx.fillRect(x, y, s, s);
      _drawStairIcon(ctx, x, y, s);
    } else if (tileId === T.CHEST) {
      ctx.fillStyle = '#3a3a50';
      ctx.fillRect(x, y, s, s);
      _drawChestIcon(ctx, x, y, s);
    } else {
      _drawDefaultTile(ctx, x, y, s, tileId);
      return;
    }
    ctx.strokeStyle = isThroneRoom ? 'rgba(80,60,120,0.25)' : 'rgba(20,20,40,0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, s, s);
    if (tileId === T.CHEST) _drawChestIcon(ctx, x, y, s);
    if (tileId === T.STAIR) _drawStairIcon(ctx, x, y, s);
  }

  // ── フィールドマップ（ワールド）タイル ────────────────────────
  function _drawWorldTile(ctx, x, y, size, tileId, mx, my) {
    const T = GameData.TILE;
    const s = size;
    const seed = mx * 31 + my * 17;
    const r1 = _tileRand(seed, 1103515245);
    const r2 = _tileRand(seed, 214013);
    const r3 = _tileRand(seed + 5, 1664525);

    if (tileId === T.GRASS) {
      // 草地ベース
      const shade = 0.78 + r1 * 0.22;
      ctx.fillStyle = `rgb(${Math.floor(52*shade)},${Math.floor(128*shade)},${Math.floor(36*shade)})`;
      ctx.fillRect(x, y, s, s);
      // 草の葉（細いブレード）
      const bladeCount = 2 + Math.floor(r2 * 3);
      for (let i = 0; i < bladeCount; i++) {
        const bx = x + _tileRand(seed + i*7, 214013) * s * 0.82 + s*0.05;
        const by = y + _tileRand(seed + i*7, 1664525) * s * 0.55 + s*0.28;
        const bh = s * (0.11 + _tileRand(seed + i*7, 1103515245) * 0.09);
        ctx.fillStyle = `rgba(82,175,50,${0.55 + _tileRand(seed+i*13,214013)*0.35})`;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - s*0.025, by + bh);
        ctx.lineTo(bx + s*0.025, by + bh);
        ctx.closePath();
        ctx.fill();
      }
      // まれに小花
      if (r3 > 0.84) {
        ctx.fillStyle = '#ffffaa';
        ctx.beginPath();
        ctx.arc(x + r1*s*0.8 + s*0.05, y + r2*s*0.65 + s*0.05, s*0.038, 0, Math.PI*2);
        ctx.fill();
      }

    } else if (tileId === T.TREE) {
      // 暗い森ベース
      ctx.fillStyle = '#183a10';
      ctx.fillRect(x, y, s, s);
      // 木の幹
      const tx = x + s*0.40 + r1*s*0.18;
      const ty = y + s*0.60;
      ctx.fillStyle = '#5a3820';
      ctx.fillRect(tx, ty, s*0.15, s*0.38);
      // 葉っぱ（複数円）
      const tcx = tx + s*0.075;
      ctx.fillStyle = '#286418';
      ctx.beginPath();
      ctx.arc(tcx, ty - s*0.10, s*0.26, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#1e5010';
      ctx.beginPath();
      ctx.arc(tcx - s*0.14, ty + s*0.02, s*0.19, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tcx + s*0.14, ty + s*0.02, s*0.19, 0, Math.PI*2);
      ctx.fill();
      // 葉ハイライト（明るい緑）
      ctx.fillStyle = '#3a8820';
      ctx.beginPath();
      ctx.arc(tcx - s*0.07, ty - s*0.18, s*0.12, 0, Math.PI*2);
      ctx.fill();

    } else if (tileId === T.MOUNTAIN) {
      // 山ベース（岩盤色）
      ctx.fillStyle = '#706050';
      ctx.fillRect(x, y, s, s);
      // 山の本体（茶灰色）
      ctx.fillStyle = '#8e7660';
      ctx.beginPath();
      ctx.moveTo(x, y + s);
      ctx.lineTo(x + s*0.24, y + s*0.38);
      ctx.lineTo(x + s*0.50, y + s*0.58);
      ctx.lineTo(x + s*0.64, y + s*0.16);
      ctx.lineTo(x + s*0.80, y + s*0.42);
      ctx.lineTo(x + s, y + s);
      ctx.closePath();
      ctx.fill();
      // 山の影面（右側暗く）
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(x + s*0.64, y + s*0.16);
      ctx.lineTo(x + s*0.80, y + s*0.42);
      ctx.lineTo(x + s, y + s);
      ctx.lineTo(x + s*0.64, y + s);
      ctx.closePath();
      ctx.fill();
      // 雪（主峰）
      ctx.fillStyle = '#f2f2fa';
      ctx.beginPath();
      ctx.moveTo(x + s*0.64, y + s*0.16);
      ctx.lineTo(x + s*0.55, y + s*0.34);
      ctx.lineTo(x + s*0.73, y + s*0.34);
      ctx.closePath();
      ctx.fill();
      // 雪（小峰）
      ctx.beginPath();
      ctx.moveTo(x + s*0.24, y + s*0.38);
      ctx.lineTo(x + s*0.18, y + s*0.50);
      ctx.lineTo(x + s*0.30, y + s*0.50);
      ctx.closePath();
      ctx.fill();
      // 岩の稜線ハイライト
      ctx.strokeStyle = 'rgba(200,185,160,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + s*0.24, y + s*0.38);
      ctx.lineTo(x + s*0.64, y + s*0.16);
      ctx.stroke();

    } else if (tileId === T.WATER) {
      // 海/川ベース（青）
      const wShade = 0.84 + r1*0.16;
      ctx.fillStyle = `rgb(${Math.floor(28*wShade)},${Math.floor(95*wShade)},${Math.floor(175*wShade)})`;
      ctx.fillRect(x, y, s, s);
      // ベジェ曲線の波（2本）
      ctx.strokeStyle = `rgba(180,225,255,${0.32 + r2*0.28})`;
      ctx.lineWidth = 1.3;
      const wy1 = y + r2*s*0.30 + s*0.18;
      ctx.beginPath();
      ctx.moveTo(x, wy1);
      ctx.bezierCurveTo(x + s*0.28, wy1 - s*0.055, x + s*0.52, wy1 + s*0.065, x + s*0.78, wy1 - s*0.03);
      ctx.bezierCurveTo(x + s*0.90, wy1 - s*0.055, x + s, wy1, x + s, wy1);
      ctx.stroke();
      const wy2 = wy1 + s*(0.26 + r3*0.14);
      ctx.beginPath();
      ctx.moveTo(x, wy2);
      ctx.bezierCurveTo(x + s*0.32, wy2 + s*0.055, x + s*0.62, wy2 - s*0.05, x + s, wy2 + s*0.025);
      ctx.stroke();
      // キラキラ
      if (r1 > 0.76) {
        ctx.fillStyle = 'rgba(225,245,255,0.72)';
        ctx.fillRect(x + r3*s*0.78 + s*0.06, y + r2*s*0.58 + s*0.08, s*0.042, s*0.042);
      }

    } else if (tileId === T.SAND) {
      // 砂漠ベース（温かい黄土色）
      const sShade = 0.84 + r1*0.16;
      ctx.fillStyle = `rgb(${Math.floor(212*sShade)},${Math.floor(175*sShade)},${Math.floor(88*sShade)})`;
      ctx.fillRect(x, y, s, s);
      // 風紋（2本の波線）
      ctx.strokeStyle = 'rgba(165,135,58,0.52)';
      ctx.lineWidth = 0.8;
      const sw1 = y + r2*s*0.32 + s*0.16;
      ctx.beginPath();
      ctx.moveTo(x, sw1);
      ctx.quadraticCurveTo(x + s*0.50, sw1 - s*0.052*r3, x + s, sw1 + s*0.042);
      ctx.stroke();
      const sw2 = sw1 + s*(0.28 + r1*0.12);
      ctx.beginPath();
      ctx.moveTo(x, sw2);
      ctx.quadraticCurveTo(x + s*0.50, sw2 + s*0.048*r3, x + s, sw2 - s*0.032);
      ctx.stroke();
      // 砂粒ドット
      ctx.fillStyle = 'rgba(160,122,52,0.65)';
      ctx.fillRect(x + r1*s*0.84, y + r2*s*0.72, s*0.042, s*0.042);
      ctx.fillRect(x + r2*s*0.48, y + r3*s*0.44, s*0.034, s*0.034);

    } else if (tileId === T.ROAD) {
      // 踏み固められた土路
      const rdShade = 0.86 + r1*0.14;
      ctx.fillStyle = `rgb(${Math.floor(148*rdShade)},${Math.floor(118*rdShade)},${Math.floor(72*rdShade)})`;
      ctx.fillRect(x, y, s, s);
      // 轍（わだち）2本の溝
      ctx.fillStyle = 'rgba(75,55,28,0.42)';
      ctx.fillRect(x + s*0.19, y, s*0.09, s);
      ctx.fillRect(x + s*0.72, y, s*0.09, s);
      // 草のはみ出し（端）
      ctx.fillStyle = 'rgba(55,108,28,0.28)';
      ctx.fillRect(x, y, s*0.14, s);
      ctx.fillRect(x + s*0.86, y, s*0.14, s);
      // 小石
      if (r2 > 0.50) {
        ctx.fillStyle = 'rgba(98,88,65,0.52)';
        ctx.beginPath();
        ctx.ellipse(x + r1*s*0.55+s*0.22, y + r3*s*0.58+s*0.18, s*0.038, s*0.024, r2*Math.PI, 0, Math.PI*2);
        ctx.fill();
      }

    } else if (tileId === T.TOWN) {
      // 町タイル（俯瞰の家）
      ctx.fillStyle = '#7e6238';
      ctx.fillRect(x, y, s, s);
      // 屋根（赤茶三角）
      ctx.fillStyle = '#be4e26';
      ctx.beginPath();
      ctx.moveTo(x + s*0.50, y + s*0.04);
      ctx.lineTo(x + s*0.09, y + s*0.44);
      ctx.lineTo(x + s*0.91, y + s*0.44);
      ctx.closePath();
      ctx.fill();
      // 屋根ハイライト（左面）
      ctx.fillStyle = '#d85e30';
      ctx.beginPath();
      ctx.moveTo(x + s*0.50, y + s*0.04);
      ctx.lineTo(x + s*0.26, y + s*0.32);
      ctx.lineTo(x + s*0.40, y + s*0.30);
      ctx.closePath();
      ctx.fill();
      // 建物本体
      ctx.fillStyle = '#c8a66a';
      ctx.fillRect(x + s*0.12, y + s*0.42, s*0.76, s*0.52);
      // 窓（青ガラス）
      ctx.fillStyle = '#7aacca';
      ctx.fillRect(x + s*0.20, y + s*0.52, s*0.20, s*0.16);
      ctx.fillRect(x + s*0.60, y + s*0.52, s*0.20, s*0.16);
      // 窓枠
      ctx.strokeStyle = '#5a4028';
      ctx.lineWidth = 1.0;
      ctx.strokeRect(x + s*0.20, y + s*0.52, s*0.20, s*0.16);
      ctx.strokeRect(x + s*0.60, y + s*0.52, s*0.20, s*0.16);
      // 扉
      ctx.fillStyle = '#6a3810';
      ctx.fillRect(x + s*0.40, y + s*0.62, s*0.20, s*0.32);

    } else if (tileId === T.FLOOR) {
      // 石畳（特殊床）
      const shade = 0.78 + r1*0.22;
      ctx.fillStyle = `rgb(${Math.floor(155*shade)},${Math.floor(150*shade)},${Math.floor(135*shade)})`;
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(80,70,55,0.42)';
      ctx.lineWidth = 1.0;
      ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);

    } else {
      _drawDefaultTile(ctx, x, y, s, tileId);
      return;
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.11)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, s, s);
  }

  function _drawChestIcon(ctx, x, y, size) {
    const m = size * 0.2;
    ctx.fillStyle   = '#d4aa00';
    ctx.fillRect(x + m, y + m * 1.5, size - m * 2, size - m * 2.5);
    ctx.fillStyle   = '#8b6914';
    ctx.fillRect(x + m, y + m * 1.2, size - m * 2, m * 0.6);
  }

  function _drawStairIcon(ctx, x, y, size) {
    ctx.fillStyle = '#aaaaaa';
    for (let i = 0; i < 4; i++) {
      const sw = size * (0.2 + i * 0.2);
      const sh = size * 0.12;
      const sy = y + size * 0.2 + i * sh;
      ctx.fillRect(x + (size - sw) / 2, sy, sw, sh);
    }
  }

  function _drawPlayer(ctx, x, y, size, flip) {
    if (flip) {
      // 左右反転して描画（歩行アニメ）
      ctx.save();
      ctx.translate(x + size / 2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(x + size / 2), 0);
      _drawPlayerSprite(ctx, x, y, size);
      ctx.restore();
    } else {
      _drawPlayerSprite(ctx, x, y, size);
    }
  }

  function _drawPlayerSprite(ctx, x, y, size) {
    const s = size, cx = x + s / 2;

    // 赤マント（背面）
    ctx.fillStyle = '#cc2200';
    ctx.beginPath();
    ctx.moveTo(cx, y + s*0.44);
    ctx.lineTo(cx - s*0.26, y + s*0.84);
    ctx.lineTo(cx + s*0.10, y + s*0.84);
    ctx.closePath();
    ctx.fill();

    // 青い鎧（胴体）
    ctx.fillStyle = '#2244aa';
    ctx.fillRect(x + s*0.30, y + s*0.44, s*0.40, s*0.38);
    // 鎧ハイライト
    ctx.fillStyle = '#5577dd';
    ctx.fillRect(x + s*0.30, y + s*0.44, s*0.40, s*0.05);
    ctx.fillRect(x + s*0.30, y + s*0.44, s*0.05, s*0.30);

    // 剣（右）
    ctx.fillStyle = '#ccddee';
    ctx.fillRect(x + s*0.70, y + s*0.34, s*0.07, s*0.34);
    // 鍔
    ctx.fillStyle = '#aa9933';
    ctx.fillRect(x + s*0.63, y + s*0.50, s*0.21, s*0.05);

    // 頭（肌色）
    ctx.fillStyle = '#f8c880';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.30, s*0.17, 0, Math.PI * 2);
    ctx.fill();

    // 兜（青）
    ctx.fillStyle = '#2244aa';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.26, s*0.20, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + s*0.27, y + s*0.26, s*0.46, s*0.08);
    // 兜ハイライト
    ctx.fillStyle = '#5577dd';
    ctx.fillRect(x + s*0.34, y + s*0.15, s*0.07, s*0.12);

    // 目
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - s*0.08, y + s*0.27, s*0.05, s*0.05);
    ctx.fillRect(cx + s*0.03, y + s*0.27, s*0.05, s*0.05);
  }

  // ── NPCアイコン（村人） ──────────────────────────────────
  function _drawNpcIcon(ctx, x, y, size) {
    const s = size, cx = x + s / 2;
    // 服（緑系）
    ctx.fillStyle = '#336622';
    ctx.fillRect(x + s*0.30, y + s*0.44, s*0.40, s*0.36);
    ctx.fillStyle = '#558844';
    ctx.fillRect(x + s*0.30, y + s*0.44, s*0.40, s*0.05);
    // 頭（肌色）
    ctx.fillStyle = '#f8c880';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.30, s*0.16, 0, Math.PI * 2);
    ctx.fill();
    // 髪（茶色）
    ctx.fillStyle = '#663311';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.25, s*0.18, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + s*0.28, y + s*0.24, s*0.06, s*0.10);
    ctx.fillRect(x + s*0.66, y + s*0.24, s*0.06, s*0.10);
    // 目
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - s*0.07, y + s*0.28, s*0.04, s*0.04);
    ctx.fillRect(cx + s*0.03, y + s*0.28, s*0.04, s*0.04);
  }

  // ── 王様アイコン（王冠・杖） ─────────────────────────────
  function _drawKingIcon(ctx, x, y, size) {
    const s = size, cx = x + s / 2;
    // ローブ（紫）
    ctx.fillStyle = '#5511aa';
    ctx.beginPath();
    ctx.moveTo(cx - s*0.22, y + s*0.44);
    ctx.lineTo(cx - s*0.28, y + s*0.84);
    ctx.lineTo(cx + s*0.28, y + s*0.84);
    ctx.lineTo(cx + s*0.22, y + s*0.44);
    ctx.closePath();
    ctx.fill();
    // ローブハイライト
    ctx.fillStyle = '#7733cc';
    ctx.fillRect(x + s*0.40, y + s*0.44, s*0.06, s*0.36);
    // 白いひげ
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(cx - s*0.13, y + s*0.36, s*0.26, s*0.11);
    // 頭（肌色）
    ctx.fillStyle = '#f8c880';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.30, s*0.17, 0, Math.PI * 2);
    ctx.fill();
    // 王冠（金）
    ctx.fillStyle = '#ddaa00';
    ctx.fillRect(cx - s*0.22, y + s*0.12, s*0.44, s*0.11);
    // 王冠の突起3本
    ctx.fillRect(cx - s*0.22, y + s*0.05, s*0.09, s*0.10);
    ctx.fillRect(cx - s*0.045, y + s*0.02, s*0.09, s*0.13);
    ctx.fillRect(cx + s*0.13, y + s*0.05, s*0.09, s*0.10);
    // 宝石（赤）
    ctx.fillStyle = '#ff2233';
    ctx.fillRect(cx - s*0.04, y + s*0.04, s*0.08, s*0.06);
    // 目
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - s*0.08, y + s*0.27, s*0.05, s*0.05);
    ctx.fillRect(cx + s*0.03, y + s*0.27, s*0.05, s*0.05);
    // 杖
    ctx.fillStyle = '#886600';
    ctx.fillRect(x + s*0.72, y + s*0.32, s*0.06, s*0.52);
    ctx.fillStyle = '#ddaa00';
    ctx.beginPath();
    ctx.arc(x + s*0.75, y + s*0.29, s*0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(x + s*0.75, y + s*0.29, s*0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 女王アイコン（ティアラ・ドレス） ────────────────────────
  function _drawQueenIcon(ctx, x, y, size) {
    const s = size, cx = x + s / 2;
    // ドレス（ピンク/紫）
    ctx.fillStyle = '#cc44aa';
    ctx.beginPath();
    ctx.moveTo(cx - s*0.24, y + s*0.46);
    ctx.lineTo(cx - s*0.34, y + s*0.86);
    ctx.lineTo(cx + s*0.34, y + s*0.86);
    ctx.lineTo(cx + s*0.24, y + s*0.46);
    ctx.closePath();
    ctx.fill();
    // ドレスハイライト
    ctx.fillStyle = '#ee66cc';
    ctx.fillRect(x + s*0.38, y + s*0.46, s*0.06, s*0.36);
    // 顔（肌色）
    ctx.fillStyle = '#f8c880';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.30, s*0.17, 0, Math.PI * 2);
    ctx.fill();
    // 長い髪（金色）
    ctx.fillStyle = '#ddaa00';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.25, s*0.20, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + s*0.25, y + s*0.24, s*0.07, s*0.26);
    ctx.fillRect(x + s*0.68, y + s*0.24, s*0.07, s*0.26);
    // ティアラ
    ctx.fillStyle = '#ddaa00';
    ctx.fillRect(cx - s*0.18, y + s*0.10, s*0.36, s*0.07);
    ctx.fillRect(cx - s*0.05, y + s*0.04, s*0.10, s*0.09);
    // ティアラ宝石
    ctx.fillStyle = '#ff88cc';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.06, s*0.03, 0, Math.PI * 2);
    ctx.fill();
    // 目
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - s*0.07, y + s*0.28, s*0.04, s*0.04);
    ctx.fillRect(cx + s*0.03, y + s*0.28, s*0.04, s*0.04);
  }

  // ── 冒険者アイコン（赤マント・旅人） ────────────────────────
  function _drawAdventurerIcon(ctx, x, y, size) {
    const s = size, cx = x + s / 2;
    // 茶色マント
    ctx.fillStyle = '#883311';
    ctx.beginPath();
    ctx.moveTo(cx, y + s*0.44);
    ctx.lineTo(cx - s*0.30, y + s*0.86);
    ctx.lineTo(cx + s*0.14, y + s*0.86);
    ctx.closePath();
    ctx.fill();
    // 茶色の服（胴体）
    ctx.fillStyle = '#664422';
    ctx.fillRect(x + s*0.30, y + s*0.44, s*0.40, s*0.38);
    ctx.fillStyle = '#885533';
    ctx.fillRect(x + s*0.30, y + s*0.44, s*0.40, s*0.05);
    // 杖（左手）
    ctx.fillStyle = '#886600';
    ctx.fillRect(x + s*0.18, y + s*0.28, s*0.05, s*0.56);
    ctx.fillStyle = '#ddaa00';
    ctx.beginPath();
    ctx.arc(x + s*0.205, y + s*0.26, s*0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#55ddff';
    ctx.beginPath();
    ctx.arc(x + s*0.205, y + s*0.26, s*0.03, 0, Math.PI * 2);
    ctx.fill();
    // 顔（肌色）
    ctx.fillStyle = '#f8c880';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.30, s*0.17, 0, Math.PI * 2);
    ctx.fill();
    // ひげ（白/灰）
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(cx - s*0.12, y + s*0.35, s*0.24, s*0.09);
    // 頭巾（茶）
    ctx.fillStyle = '#664422';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.25, s*0.19, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + s*0.27, y + s*0.24, s*0.06, s*0.10);
    ctx.fillRect(x + s*0.67, y + s*0.24, s*0.06, s*0.10);
    // 目
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - s*0.07, y + s*0.27, s*0.04, s*0.04);
    ctx.fillRect(cx + s*0.03, y + s*0.27, s*0.04, s*0.04);
  }

  // ── 近衛兵アイコン（板金鎧・槍・赤い羽飾り兜） ─────────────────
  function _drawGuardIcon(ctx, x, y, size) {
    const s = size, cx = x + s / 2;

    // 槍の柄（後ろに描く）
    ctx.fillStyle = '#7a6040';
    ctx.fillRect(cx + s*0.20, y + s*0.04, s*0.055, s*0.80);
    // 槍穂先
    ctx.fillStyle = '#c8d8e8';
    ctx.beginPath();
    ctx.moveTo(cx + s*0.228, y + s*0.04);
    ctx.lineTo(cx + s*0.178, y + s*0.17);
    ctx.lineTo(cx + s*0.278, y + s*0.17);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(200,220,240,0.6)';
    ctx.fillRect(cx + s*0.215, y + s*0.14, s*0.025, s*0.04);

    // 鎧胴体（プレートアーマー）
    ctx.fillStyle = '#7a8e9e';
    ctx.fillRect(x + s*0.27, y + s*0.44, s*0.46, s*0.38);
    // 鎧ハイライト（左上）
    ctx.fillStyle = '#9ab4c8';
    ctx.fillRect(x + s*0.27, y + s*0.44, s*0.46, s*0.055);
    ctx.fillRect(x + s*0.27, y + s*0.44, s*0.055, s*0.30);
    // 鎧の縦分割ライン
    ctx.fillStyle = 'rgba(40,55,70,0.42)';
    ctx.fillRect(cx - s*0.035, y + s*0.44, s*0.07, s*0.38);
    // 腰帯（深紅）
    ctx.fillStyle = '#991818';
    ctx.fillRect(x + s*0.27, y + s*0.73, s*0.46, s*0.065);

    // 頭（肌色）
    ctx.fillStyle = '#f0c068';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.30, s*0.165, 0, Math.PI * 2);
    ctx.fill();

    // 鉄兜（プレート）
    ctx.fillStyle = '#7a8e9e';
    ctx.beginPath();
    ctx.arc(cx, y + s*0.245, s*0.205, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + s*0.255, y + s*0.245, s*0.49, s*0.08);
    // 兜ハイライト
    ctx.fillStyle = '#9ab4c8';
    ctx.fillRect(x + s*0.31, y + s*0.12, s*0.08, s*0.13);
    // 兜の目庇（鍔）
    ctx.fillStyle = '#5e7080';
    ctx.fillRect(x + s*0.255, y + s*0.315, s*0.49, s*0.042);
    // 兜の額当て（細線）
    ctx.fillStyle = 'rgba(40,55,70,0.45)';
    ctx.fillRect(cx - s*0.025, y + s*0.12, s*0.05, s*0.18);

    // 羽飾り（赤いプリューム）
    ctx.fillStyle = '#cc1e1e';
    ctx.beginPath();
    ctx.moveTo(cx + s*0.05, y + s*0.05);
    ctx.bezierCurveTo(cx + s*0.22, y - s*0.02, cx + s*0.34, y + s*0.12, cx + s*0.12, y + s*0.22);
    ctx.bezierCurveTo(cx + s*0.18, y + s*0.14, cx + s*0.08, y + s*0.09, cx + s*0.05, y + s*0.05);
    ctx.fill();
    ctx.fillStyle = '#ee3838';
    ctx.beginPath();
    ctx.moveTo(cx + s*0.05, y + s*0.05);
    ctx.bezierCurveTo(cx + s*0.17, y + s*0.00, cx + s*0.25, y + s*0.12, cx + s*0.10, y + s*0.19);
    ctx.fill();

    // 目
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - s*0.08, y + s*0.27, s*0.045, s*0.045);
    ctx.fillRect(cx + s*0.035, y + s*0.27, s*0.045, s*0.045);
  }

  // ── 城アイコン（城・王の間入口） ────────────────────────────
  function _drawCastleIcon(ctx, x, y, size) {
    const s = size;
    // === 城壁（外壁） ===
    ctx.fillStyle = '#b8b0a0';
    ctx.fillRect(x + s*0.02, y + s*0.55, s*0.96, s*0.45);
    // 城壁の影
    ctx.fillStyle = '#908878';
    ctx.fillRect(x + s*0.02, y + s*0.55, s*0.96, s*0.04);

    // === 左の丸塔 ===
    ctx.fillStyle = '#a8a090';
    ctx.fillRect(x + s*0.02, y + s*0.28, s*0.22, s*0.72);
    // 塔の屋根（とんがり・青）
    ctx.fillStyle = '#2244aa';
    ctx.beginPath();
    ctx.moveTo(x + s*0.13, y + s*0.08);
    ctx.lineTo(x - s*0.01, y + s*0.32);
    ctx.lineTo(x + s*0.27, y + s*0.32);
    ctx.closePath();
    ctx.fill();
    // 旗竿＋旗
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + s*0.13, y + s*0.08);
    ctx.lineTo(x + s*0.13, y - s*0.02);
    ctx.stroke();
    ctx.fillStyle = '#dd2222';
    ctx.fillRect(x + s*0.13, y - s*0.02, s*0.10, s*0.06);

    // === 右の丸塔 ===
    ctx.fillStyle = '#a8a090';
    ctx.fillRect(x + s*0.76, y + s*0.28, s*0.22, s*0.72);
    // 塔の屋根
    ctx.fillStyle = '#2244aa';
    ctx.beginPath();
    ctx.moveTo(x + s*0.87, y + s*0.08);
    ctx.lineTo(x + s*0.73, y + s*0.32);
    ctx.lineTo(x + s*1.01, y + s*0.32);
    ctx.closePath();
    ctx.fill();
    // 旗竿＋旗
    ctx.strokeStyle = '#666';
    ctx.beginPath();
    ctx.moveTo(x + s*0.87, y + s*0.08);
    ctx.lineTo(x + s*0.87, y - s*0.02);
    ctx.stroke();
    ctx.fillStyle = '#dd2222';
    ctx.fillRect(x + s*0.87, y - s*0.02, s*0.10, s*0.06);

    // === 中央の天守 ===
    ctx.fillStyle = '#c0b8a8';
    ctx.fillRect(x + s*0.30, y + s*0.22, s*0.40, s*0.40);
    // 天守の屋根（大きい青屋根）
    ctx.fillStyle = '#1838a0';
    ctx.beginPath();
    ctx.moveTo(x + s*0.50, y + s*0.02);
    ctx.lineTo(x + s*0.24, y + s*0.26);
    ctx.lineTo(x + s*0.76, y + s*0.26);
    ctx.closePath();
    ctx.fill();
    // 屋根のハイライト
    ctx.fillStyle = '#2850c0';
    ctx.beginPath();
    ctx.moveTo(x + s*0.50, y + s*0.02);
    ctx.lineTo(x + s*0.37, y + s*0.14);
    ctx.lineTo(x + s*0.50, y + s*0.14);
    ctx.closePath();
    ctx.fill();

    // === 窓 ===
    // 天守の窓（黄色く光る）
    ctx.fillStyle = '#eecc44';
    ctx.fillRect(x + s*0.42, y + s*0.32, s*0.07, s*0.08);
    ctx.fillRect(x + s*0.52, y + s*0.32, s*0.07, s*0.08);
    // 左塔の窓
    ctx.fillRect(x + s*0.08, y + s*0.38, s*0.07, s*0.07);
    // 右塔の窓
    ctx.fillRect(x + s*0.84, y + s*0.38, s*0.07, s*0.07);

    // === 城門（アーチ） ===
    ctx.fillStyle = '#3a2200';
    ctx.fillRect(x + s*0.38, y + s*0.68, s*0.24, s*0.32);
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.68, s*0.12, Math.PI, 0);
    ctx.fill();
    // 門の装飾
    ctx.fillStyle = '#c8a030';
    ctx.fillRect(x + s*0.48, y + s*0.78, s*0.04, s*0.04);

    // === 銃眼（城壁の上） ===
    ctx.fillStyle = '#706858';
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(x + s*0.06 + i*s*0.13, y + s*0.52, s*0.06, s*0.05);
    }
  }

  // ── 魔王城アイコン（暗い城・赤く光る窓） ──────────────────
  function _drawDarkCastleIcon(ctx, x, y, size) {
    const s = size;
    // 左の塔（暗黒色）
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(x + s*0.04, y + s*0.30, s*0.23, s*0.70);
    // 右の塔
    ctx.fillRect(x + s*0.73, y + s*0.30, s*0.23, s*0.70);
    // 中央の壁
    ctx.fillRect(x + s*0.22, y + s*0.44, s*0.56, s*0.56);
    // 中央の高い塔
    ctx.fillStyle = '#110505';
    ctx.fillRect(x + s*0.35, y + s*0.10, s*0.30, s*0.38);
    // 暗い影ライン
    ctx.fillStyle = '#330000';
    ctx.fillRect(x + s*0.04, y + s*0.30, s*0.23, s*0.04);
    ctx.fillRect(x + s*0.73, y + s*0.30, s*0.23, s*0.04);
    ctx.fillRect(x + s*0.22, y + s*0.44, s*0.56, s*0.04);
    ctx.fillRect(x + s*0.35, y + s*0.10, s*0.30, s*0.04);
    // 銃眼（左塔）- 赤みがかった黒
    ctx.fillStyle = '#2a0000';
    ctx.fillRect(x + s*0.04, y + s*0.22, s*0.08, s*0.10);
    ctx.fillRect(x + s*0.16, y + s*0.22, s*0.08, s*0.10);
    // 銃眼（右塔）
    ctx.fillRect(x + s*0.73, y + s*0.22, s*0.08, s*0.10);
    ctx.fillRect(x + s*0.85, y + s*0.22, s*0.08, s*0.10);
    // 銃眼（中央塔）
    ctx.fillRect(x + s*0.35, y + s*0.02, s*0.07, s*0.10);
    ctx.fillRect(x + s*0.46, y + s*0.02, s*0.07, s*0.10);
    ctx.fillRect(x + s*0.57, y + s*0.02, s*0.07, s*0.10);
    // 赤く光る窓（中央塔）
    const grd = ctx.createRadialGradient(
      x + s*0.50, y + s*0.22, 0,
      x + s*0.50, y + s*0.22, s*0.12
    );
    grd.addColorStop(0, 'rgba(255,40,0,0.9)');
    grd.addColorStop(1, 'rgba(80,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x + s*0.36, y + s*0.14, s*0.28, s*0.20);
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(x + s*0.42, y + s*0.18, s*0.16, s*0.10);
    // 窓（左塔）- 赤
    ctx.fillStyle = '#881100';
    ctx.fillRect(x + s*0.08, y + s*0.36, s*0.10, s*0.10);
    // 窓（右塔）- 赤
    ctx.fillRect(x + s*0.82, y + s*0.36, s*0.10, s*0.10);
    // 暗い門
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + s*0.40, y + s*0.62, s*0.20, s*0.38);
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.62, s*0.10, Math.PI, 0);
    ctx.fill();
    // 門の縁（血赤）
    ctx.strokeStyle = '#880000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.62, s*0.10, Math.PI, 0);
    ctx.stroke();
  }

  // ── 建物アイコン（一般的な家・店） ──────────────────────────
  // ── くさのどうくつアイコン（洞窟入口） ─────────────────────
  function _drawCaveIcon(ctx, x, y, size) {
    const s = size;
    // 岩山
    ctx.fillStyle = '#5a4a3a';
    ctx.beginPath();
    ctx.moveTo(x + s*0.08, y + s*0.95);
    ctx.lineTo(x + s*0.20, y + s*0.18);
    ctx.quadraticCurveTo(x + s*0.50, y - s*0.05, x + s*0.80, y + s*0.18);
    ctx.lineTo(x + s*0.92, y + s*0.95);
    ctx.closePath();
    ctx.fill();
    // 岩のハイライト
    ctx.fillStyle = '#7a6a5a';
    ctx.beginPath();
    ctx.moveTo(x + s*0.25, y + s*0.22);
    ctx.quadraticCurveTo(x + s*0.50, y + s*0.05, x + s*0.75, y + s*0.22);
    ctx.lineTo(x + s*0.60, y + s*0.38);
    ctx.lineTo(x + s*0.40, y + s*0.38);
    ctx.closePath();
    ctx.fill();
    // 洞窟の穴（暗いアーチ）
    ctx.fillStyle = '#0a0008';
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.60, s*0.24, Math.PI, 0);
    ctx.lineTo(x + s*0.74, y + s*0.95);
    ctx.lineTo(x + s*0.26, y + s*0.95);
    ctx.closePath();
    ctx.fill();
    // 穴の縁
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.60, s*0.25, Math.PI, 0);
    ctx.stroke();
    // 穴の中の不気味な光
    ctx.fillStyle = 'rgba(80,255,80,0.15)';
    ctx.beginPath();
    ctx.ellipse(x + s*0.50, y + s*0.68, s*0.12, s*0.08, 0, 0, Math.PI*2);
    ctx.fill();
  }

  // ── まのとうアイコン（暗い塔） ────────────────────────────
  function _drawTowerIcon(ctx, x, y, size) {
    const s = size;
    // 塔本体
    ctx.fillStyle = '#2a1a30';
    ctx.fillRect(x + s*0.30, y + s*0.20, s*0.40, s*0.80);
    // 上に向かって少し細くなる壁
    ctx.fillStyle = '#221828';
    ctx.beginPath();
    ctx.moveTo(x + s*0.25, y + s*0.95);
    ctx.lineTo(x + s*0.32, y + s*0.20);
    ctx.lineTo(x + s*0.68, y + s*0.20);
    ctx.lineTo(x + s*0.75, y + s*0.95);
    ctx.closePath();
    ctx.fill();
    // 尖り屋根
    ctx.fillStyle = '#3a0a40';
    ctx.beginPath();
    ctx.moveTo(x + s*0.50, y - s*0.02);
    ctx.lineTo(x + s*0.26, y + s*0.24);
    ctx.lineTo(x + s*0.74, y + s*0.24);
    ctx.closePath();
    ctx.fill();
    // 屋根の先端
    ctx.fillStyle = '#ff3300';
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.01, s*0.04, 0, Math.PI*2);
    ctx.fill();
    // 窓（赤く光る）
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(x + s*0.43, y + s*0.34, s*0.14, s*0.10);
    ctx.fillStyle = '#aa1100';
    ctx.fillRect(x + s*0.43, y + s*0.54, s*0.14, s*0.10);
    // 窓の光のグロウ
    ctx.fillStyle = 'rgba(255,50,0,0.15)';
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.39, s*0.12, 0, Math.PI*2);
    ctx.fill();
    // 扉
    ctx.fillStyle = '#110008';
    ctx.fillRect(x + s*0.40, y + s*0.74, s*0.20, s*0.21);
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.74, s*0.10, Math.PI, 0);
    ctx.fill();
    // レンガ線
    ctx.strokeStyle = '#1a1020';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
      const ly = y + s*0.28 + i*s*0.11;
      ctx.beginPath();
      ctx.moveTo(x + s*0.28, ly);
      ctx.lineTo(x + s*0.72, ly);
      ctx.stroke();
    }
  }

  // ── あらのの町アイコン（砂漠の町） ────────────────────────
  function _drawDesertTownIcon(ctx, x, y, size) {
    const s = size;
    // メインの砂色の建物（ドーム屋根）
    ctx.fillStyle = '#c8a862';
    ctx.fillRect(x + s*0.15, y + s*0.45, s*0.45, s*0.50);
    // ドーム屋根
    ctx.fillStyle = '#d4b872';
    ctx.beginPath();
    ctx.arc(x + s*0.375, y + s*0.45, s*0.225, Math.PI, 0);
    ctx.fill();
    // 小さい建物（右）
    ctx.fillStyle = '#b89850';
    ctx.fillRect(x + s*0.58, y + s*0.55, s*0.30, s*0.40);
    // 小さいドーム
    ctx.fillStyle = '#c8a860';
    ctx.beginPath();
    ctx.arc(x + s*0.73, y + s*0.55, s*0.15, Math.PI, 0);
    ctx.fill();
    // 窓（暗い穴）
    ctx.fillStyle = '#3a2810';
    ctx.fillRect(x + s*0.28, y + s*0.55, s*0.10, s*0.10);
    ctx.fillRect(x + s*0.65, y + s*0.62, s*0.08, s*0.08);
    // 扉（アーチ型）
    ctx.fillStyle = '#2a1808';
    ctx.fillRect(x + s*0.32, y + s*0.75, s*0.12, s*0.20);
    ctx.beginPath();
    ctx.arc(x + s*0.38, y + s*0.75, s*0.06, Math.PI, 0);
    ctx.fill();
    // ヤシの木（左端）
    ctx.fillStyle = '#6a4a20';
    ctx.fillRect(x + s*0.02, y + s*0.40, s*0.05, s*0.55);
    ctx.fillStyle = '#22880a';
    ctx.beginPath();
    ctx.ellipse(x + s*0.045, y + s*0.35, s*0.10, s*0.08, -0.3, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + s*0.06, y + s*0.32, s*0.10, s*0.06, 0.4, 0, Math.PI*2);
    ctx.fill();
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + s*0.15, y + s*0.90, s*0.73, s*0.05);
  }

  function _drawBuildingIcon(ctx, x, y, size) {
    const m = size * 0.15;
    // 壁
    ctx.fillStyle = '#8b5e3c';
    ctx.fillRect(x + m, y + size * 0.35, size - m * 2, size * 0.5);
    // 屋根
    ctx.fillStyle = '#5a3e1b';
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y + size * 0.12);
    ctx.lineTo(x + m * 0.5,  y + size * 0.38);
    ctx.lineTo(x + size - m * 0.5, y + size * 0.38);
    ctx.closePath();
    ctx.fill();
  }

  // ── ボスアイコン（赤い敵） ───────────────────────────────
  function _drawBossIcon(ctx, x, y, size) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    // 体
    ctx.fillStyle = '#cc0000';
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.05, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // 角
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.18, cy - size * 0.18);
    ctx.lineTo(cx - size * 0.26, cy - size * 0.38);
    ctx.lineTo(cx - size * 0.08, cy - size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.18, cy - size * 0.18);
    ctx.lineTo(cx + size * 0.26, cy - size * 0.38);
    ctx.lineTo(cx + size * 0.08, cy - size * 0.2);
    ctx.closePath();
    ctx.fill();
    // 目
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(cx - size * 0.12, cy - size * 0.04, size * 0.08, size * 0.07);
    ctx.fillRect(cx + size * 0.04, cy - size * 0.04, size * 0.08, size * 0.07);
  }

  // ── 宿屋アイコン（青い建物） ─────────────────────────────
  function _drawInnIcon(ctx, x, y, size) {
    const m = size * 0.15;
    ctx.fillStyle = '#2244aa';
    ctx.fillRect(x + m, y + size * 0.35, size - m * 2, size * 0.5);
    ctx.fillStyle = '#112277';
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y + size * 0.12);
    ctx.lineTo(x + m * 0.5,  y + size * 0.38);
    ctx.lineTo(x + size - m * 0.5, y + size * 0.38);
    ctx.closePath();
    ctx.fill();
    // 看板「宿」
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(size * 0.28)}px 'DotGothic16', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('宿', x + size / 2, y + size * 0.63);
  }

  // ── ショップアイコン（黄色の看板） ──────────────────────────
  function _drawShopIcon(ctx, x, y, size) {
    const m = size * 0.15;
    ctx.fillStyle = '#aa8800';
    ctx.fillRect(x + m, y + size * 0.25, size - m * 2, size * 0.55);
    ctx.fillStyle = '#ffdd00';
    ctx.fillRect(x + m + size * 0.04, y + size * 0.29, size - m * 2 - size * 0.08, size * 0.22);
    ctx.fillStyle = '#333300';
    ctx.font = `bold ${Math.floor(size * 0.22)}px 'DotGothic16', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('みせ', x + size / 2, y + size * 0.41);
  }

  // ── 姫アイコン（ピンクのキャラ） ────────────────────────────
  function _drawPrincessIcon(ctx, x, y, size) {
    const cx = x + size / 2;
    // 頭
    ctx.fillStyle = '#f8d090';
    ctx.beginPath();
    ctx.arc(cx, y + size * 0.28, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    // 髪飾り（クラウン風）
    ctx.fillStyle = '#ff88bb';
    ctx.fillRect(cx - size * 0.16, y + size * 0.1, size * 0.32, size * 0.09);
    ctx.fillRect(cx - size * 0.06, y + size * 0.04, size * 0.12, size * 0.08);
    // ドレス
    ctx.fillStyle = '#ff88bb';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.1, y + size * 0.44);
    ctx.lineTo(cx + size * 0.1, y + size * 0.44);
    ctx.lineTo(cx + size * 0.22, y + size * 0.82);
    ctx.lineTo(cx - size * 0.22, y + size * 0.82);
    ctx.closePath();
    ctx.fill();
  }

  // ── ヘルパー ─────────────────────────────────────────────
  function _currentMap() {
    return GameData.MAPS[state.currentMapId];
  }

  function _getTile(x, y) {
    const map = _currentMap();
    return map.data[y * map.width + x];
  }

  function _setTile(x, y, tileId) {
    const map = _currentMap();
    map.data[y * map.width + x] = tileId;
  }

  function _getEvent(x, y) {
    const map = _currentMap();
    if (!map.events) return null;
    return map.events.find(e => e.x === x && e.y === y) || null;
  }

  function _getEventByNpcId(npcId) {
    const map = _currentMap();
    if (!map.events) return null;
    return map.events.find(e => e.npcId === npcId) || null;
  }

  // ── 公開API ───────────────────────────────────────────────
  return {
    init,
    loadMap,
    render,
    resize,
    setBossCleared,
    isBossCleared,
    getState : () => ({ ...state }),
    getPlayerPos : () => ({ x: state.playerX, y: state.playerY }),
    getCurrentMapId : () => state.currentMapId,
    setMoveLock : (v) => { state.moving = v; },
    getMapState() {
      return {
        currentMapId : state.currentMapId,
        playerX      : state.playerX,
        playerY      : state.playerY,
        openedChests : JSON.parse(JSON.stringify(state.openedChests)),
        clearedBoss  : JSON.parse(JSON.stringify(state.clearedBoss)),
      };
    },
    setMapState(s) {
      state.openedChests = s.openedChests || {};
      state.clearedBoss  = s.clearedBoss  || {};
      loadMap(s.currentMapId, s.playerX, s.playerY);
    },
  };

})();
