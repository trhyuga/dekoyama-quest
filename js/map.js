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
    state.moving  = true;
    state.playerX = nx;
    state.playerY = ny;
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

      case 'npc':
        _movePlayer(nx, ny);
        setTimeout(() => {
          if (typeof UI !== 'undefined' && typeof Game !== 'undefined') {
            if (ev.npcId === 'king') {
              const kd = Game.getKingDialog();
              UI.showNpcDialog(kd.lines, kd.onClose);
            } else {
              const lines = GameData.NPC[ev.npcId];
              if (lines) UI.showNpcDialog(lines);
            }
          }
        }, 150);
        break;

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
          case 'npc':
            if (ev.npcId === 'king') {
              _drawKingIcon(ctx, sx, sy, tileSize);
            } else {
              _drawNpcIcon(ctx, sx, sy, tileSize);
            }
            break;
          case 'teleport': {
            const d = ev.dest || '';
            if (d === 'castle_town' || d === 'throne_room') {
              _drawCastleIcon(ctx, sx, sy, tileSize);
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

    // プレイヤー描画
    const px = (state.playerX - state.cameraX) * tileSize;
    const py = (state.playerY - state.cameraY) * tileSize;
    _drawPlayer(ctx, px, py, tileSize);

    // ダンジョン暗闇オーバーレイ
    if (map.isDungeon && !_isDungeonBossCleared()) {
      _renderDarkness(tileSize, viewH);
    }
  }

  // ── 暗闇描画 ─────────────────────────────────────────────
  function _renderDarkness(tileSize, viewH) {
    // たいまつの明るさ半径（タイル単位）
    const radius = state.torchLife > 0
      ? 1.5 + 3.5 * (state.torchLife / TORCH_MAX)  // 1.5〜5.0
      : 0.8;                                        // たいまつなし：ほぼ足元のみ

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

  function _drawPlayer(ctx, x, y, size) {
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

  // ── 城アイコン（城・王の間入口） ────────────────────────────
  function _drawCastleIcon(ctx, x, y, size) {
    const s = size;
    // 左の塔
    ctx.fillStyle = '#aaaabc';
    ctx.fillRect(x + s*0.04, y + s*0.30, s*0.23, s*0.70);
    // 右の塔
    ctx.fillRect(x + s*0.73, y + s*0.30, s*0.23, s*0.70);
    // 中央の壁
    ctx.fillRect(x + s*0.22, y + s*0.44, s*0.56, s*0.56);
    // 中央の高い塔
    ctx.fillStyle = '#9999ab';
    ctx.fillRect(x + s*0.35, y + s*0.10, s*0.30, s*0.38);
    // 影ライン（奥行き感）
    ctx.fillStyle = '#77778a';
    ctx.fillRect(x + s*0.04, y + s*0.30, s*0.23, s*0.04);
    ctx.fillRect(x + s*0.73, y + s*0.30, s*0.23, s*0.04);
    ctx.fillRect(x + s*0.22, y + s*0.44, s*0.56, s*0.04);
    ctx.fillRect(x + s*0.35, y + s*0.10, s*0.30, s*0.04);
    // 銃眼（左塔）
    ctx.fillStyle = '#555566';
    ctx.fillRect(x + s*0.04, y + s*0.22, s*0.08, s*0.10);
    ctx.fillRect(x + s*0.16, y + s*0.22, s*0.08, s*0.10);
    // 銃眼（右塔）
    ctx.fillRect(x + s*0.73, y + s*0.22, s*0.08, s*0.10);
    ctx.fillRect(x + s*0.85, y + s*0.22, s*0.08, s*0.10);
    // 銃眼（中央塔）
    ctx.fillRect(x + s*0.35, y + s*0.02, s*0.07, s*0.10);
    ctx.fillRect(x + s*0.46, y + s*0.02, s*0.07, s*0.10);
    ctx.fillRect(x + s*0.57, y + s*0.02, s*0.07, s*0.10);
    // 窓（中央塔）
    ctx.fillStyle = '#334488';
    ctx.fillRect(x + s*0.42, y + s*0.18, s*0.16, s*0.14);
    // 窓（左塔）
    ctx.fillStyle = '#334488';
    ctx.fillRect(x + s*0.08, y + s*0.36, s*0.10, s*0.10);
    // 窓（右塔）
    ctx.fillRect(x + s*0.82, y + s*0.36, s*0.10, s*0.10);
    // 門（アーチ型）
    ctx.fillStyle = '#221100';
    ctx.fillRect(x + s*0.40, y + s*0.62, s*0.20, s*0.38);
    ctx.beginPath();
    ctx.arc(x + s*0.50, y + s*0.62, s*0.10, Math.PI, 0);
    ctx.fill();
  }

  // ── 建物アイコン（一般的な家・店） ──────────────────────────
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
