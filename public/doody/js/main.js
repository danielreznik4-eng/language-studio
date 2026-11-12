/* Call of Doody - main.js : main menu, renderer, game loop, pause, game over */
(function () {
  'use strict';
  const COD = window.COD;

  const INIT_ORDER = ['world', 'buildings', 'weapons', 'projectiles', 'viewmodel', 'playerCtl', 'vehicles', 'loot',
    'bots', 'drones', 'gamemode', 'mortar', 'hud', 'testmode'];
  const UPDATE_ORDER = ['input', 'gamemode', 'playerCtl', 'vehicles', 'bots', 'drones', 'weapons', 'projectiles',
    'loot', 'world', 'buildings', 'viewmodel', 'mortar', 'hud', 'testmode'];

  const ui = { root: null, menu: null, pause: null, over: null, hint: null, mission: null, err: null };
  const errCount = {};
  let canvas = null, lastT = 0, loopStarted = false;
  const sel = { size: 5, teams: 4, gfx: 'high' };

  // ---------------------------------------------------------------- error display
  function reportError(where, e) {
    const key = where;
    errCount[key] = (errCount[key] || 0) + 1;
    if (errCount[key] === 1 || errCount[key] % 600 === 0) {
      console.error('[COD:' + where + ']', e);
      if (!ui.err) {
        ui.err = document.createElement('div'); ui.err.id = 'error-box'; document.body.appendChild(ui.err);
      }
      ui.err.style.display = 'block';
      const msg = '[' + where + '] ' + (e && e.message ? e.message : e);
      if (ui.err.textContent.length > 2000) ui.err.textContent = '';
      ui.err.textContent += msg + '\n';
    }
  }
  window.addEventListener('error', function (ev) { reportError('window', ev.error || ev.message); });

  // ---------------------------------------------------------------- DOM helpers
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function optionRow(label, values, current, onPick) {
    const row = el('div', 'menu-row');
    row.appendChild(el('div', 'menu-label', label));
    const btns = [];
    values.forEach(function (v) {
      const b = el('button', 'menu-opt' + (v === current ? ' sel' : ''), String(v));
      b.type = 'button';
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        onPick(v);
      });
      btns.push(b);
      row.appendChild(b);
    });
    return row;
  }

  // ---------------------------------------------------------------- menus
  function showMainMenu() {
    ui.menu = el('div', 'menu-screen');
    ui.menu.appendChild(el('h1', 'menu-title', 'Call of Doody'));
    ui.menu.appendChild(el('div', 'menu-sub', 'CAPTURE ALL THREE POINTS'));
    ui.menu.appendChild(optionRow('Team size', [5, 4, 3, 2, 1], sel.size, function (v) { sel.size = v; }));
    ui.menu.appendChild(optionRow('Number of teams', [2, 3, 4], sel.teams, function (v) { sel.teams = v; }));
    ui.menu.appendChild(optionRow('Graphics', ['High', 'Low'], sel.gfx === 'low' ? 'Low' : 'High', function (v) { sel.gfx = v.toLowerCase(); }));
    const btns = el('div', 'menu-row');
    const play = el('button', 'menu-btn', 'Play');
    const test = el('button', 'menu-btn alt', 'Test Mode');
    play.addEventListener('click', function () { startGame('normal'); });
    test.addEventListener('click', function () { startGame('test'); });
    btns.appendChild(play); btns.appendChild(test);
    ui.menu.appendChild(btns);
    ui.menu.appendChild(el('div', 'menu-help',
      '<b>WASD</b> move &nbsp; <b>Shift</b> sprint &nbsp; <b>C / Ctrl</b> crouch &nbsp; <b>Space</b> jump / vault &nbsp; <b>Mouse</b> aim &amp; fire (RMB = aim)<br>' +
      '<b>R</b> reload &nbsp; <b>1-5 / wheel</b> swap weapon &nbsp; <b>Q</b> drop weapon &nbsp; <b>G</b> grenade &nbsp; <b>E</b> use / enter / exit &nbsp; <b>F</b> armor plate &nbsp; <b>H</b> medkit<br>' +
      '<b>Tab</b> scoreboard &nbsp; <b>M</b> big map &nbsp; <b>T</b> test menu (Test Mode) &nbsp; <b>Esc</b> pause<br>' +
      'Phase 1 (0-5 min): unlimited lives. Phase 2 (5-20 min): drones arrive, 5 lives. Final phase: 1 life.'));
    ui.root.appendChild(ui.menu);
  }

  function showLoading(text) {
    ui.menu = el('div', 'menu-screen');
    ui.menu.appendChild(el('h1', 'menu-title', 'Call of Doody'));
    ui.menu.appendChild(el('div', 'menu-sub', text));
    const bar = el('div', 'loading-bar'); bar.appendChild(el('div'));
    ui.menu.appendChild(bar);
    ui.root.appendChild(ui.menu);
    return bar.firstChild;
  }

  function showPause() {
    if (ui.pause || COD.state.paused || !COD.state.running || (COD.gamemode && COD.gamemode.over)) return;
    COD.state.paused = true;
    COD.input.releaseLock();
    ui.pause = el('div', 'menu-screen clear');
    ui.pause.appendChild(el('h1', 'menu-title', 'Paused'));
    const resume = el('button', 'menu-btn', 'Resume');
    const restart = el('button', 'menu-btn alt', 'Restart');
    resume.addEventListener('click', hidePause);
    restart.addEventListener('click', function () { location.reload(); });
    ui.pause.appendChild(resume); ui.pause.appendChild(restart);
    ui.root.appendChild(ui.pause);
  }
  function hidePause() {
    if (ui.pause) { ui.pause.remove(); ui.pause = null; }
    COD.state.paused = false;
    if (!COD.state.uiMode) COD.input.requestLock();
  }

  function showGameOver(winner) {
    if (ui.over) return;
    COD.input.setUIMode(true);
    COD.state.paused = true;
    if (ui.pause) { ui.pause.remove(); ui.pause = null; }
    ui.over = el('div', 'menu-screen clear');
    let title, color = '#f5c542';
    if (winner === 0) title = 'VICTORY';
    else if (winner < 0) title = 'DRAW';
    else { title = 'DEFEAT'; color = '#ef4444'; }
    const h = el('h1', 'menu-title', title); h.style.color = color;
    ui.over.appendChild(h);
    if (winner >= 0) ui.over.appendChild(el('div', 'menu-sub', COD.TEAMS[winner].name.toUpperCase() + ' TEAM WINS'));
    const p = COD.player;
    if (p) ui.over.appendChild(el('div', 'menu-sub', 'Your kills: ' + p.kills + ' &nbsp; Deaths: ' + p.deaths + ' &nbsp; Score: ' + p.score));
    const again = el('button', 'menu-btn', 'Play Again');
    again.addEventListener('click', function () { location.reload(); });
    ui.over.appendChild(again);
    ui.root.appendChild(ui.over);
  }

  // ---------------------------------------------------------------- game start
  function callModule(name, fn, arg) {
    const m = COD[name];
    if (!m || typeof m[fn] !== 'function') return;
    try { m[fn](arg); } catch (e) { reportError(name + '.' + fn, e); }
  }

  function startGame(mode) {
    if (COD.state.loading || COD.state.running) return;
    COD.state.loading = true;
    COD.config.mode = mode;
    COD.config.teamSize = sel.size;
    COD.config.teamCount = sel.teams;
    COD.config.gfx = sel.gfx;
    if (ui.menu) { ui.menu.remove(); ui.menu = null; }
    const bar = showLoading('Loading island...');

    setTimeout(function () {
      try { setupRenderer(); } catch (e) { reportError('renderer', e); return; }
      COD.input.init();
      const total = INIT_ORDER.length;
      let i = 0;
      (function step() {
        if (i < total) {
          callModule(INIT_ORDER[i], 'init');
          i++;
          bar.style.width = Math.round(i / total * 100) + '%';
          setTimeout(step, 0);
        } else {
          finishStart();
        }
      })();
    }, 30);
  }

  function setupRenderer() {
    canvas = document.getElementById('game-canvas');
    const high = COD.config.gfx !== 'low';
    const r = new THREE.WebGLRenderer({ canvas: canvas, antialias: high, powerPreference: 'high-performance' });
    r.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = high;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x87b8e8);
    COD.renderer = r;

    COD.scene = new THREE.Scene();
    COD.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 3000);
    COD.scene.add(COD.camera);
    COD.camera.position.set(0, 20, 0);
    COD.baseFov = 75;

    window.addEventListener('resize', onResize);
  }

  function onResize() {
    if (!COD.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    COD.renderer.setSize(w, h, false);
    COD.camera.aspect = w / h;
    COD.camera.updateProjectionMatrix();
    const o = COD.state.cameraOverride;
    if (o && o.isPerspectiveCamera) { o.aspect = w / h; o.updateProjectionMatrix(); }
  }

  function finishStart() {
    if (ui.menu) { ui.menu.remove(); ui.menu = null; }
    ui.hint = el('div'); ui.hint.id = 'click-hint'; ui.hint.textContent = 'Click to capture mouse';
    ui.root.appendChild(ui.hint);
    ui.mission = el('div'); ui.mission.id = 'mission-hint';
    ui.root.appendChild(ui.mission);

    COD.on('unlocked', function (e) {
      if (!e.expected && COD.state.running && !COD.state.uiMode && !(COD.gamemode && COD.gamemode.over)) showPause();
    });
    COD.on('gameOver', function (e) { setTimeout(function () { showGameOver(e.winner); }, 1500); });

    COD.state.running = true;
    COD.state.loading = false;
    COD.state.paused = false;
    COD.input.requestLock();
    lastT = performance.now();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(frame); }
  }

  // ---------------------------------------------------------------- loop
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;

    if (COD.state.running && !COD.state.paused) {
      for (let i = 0; i < UPDATE_ORDER.length; i++) callModule(UPDATE_ORDER[i], 'update', dt);
    }

    if (COD.renderer) {
      const cam = COD.state.cameraOverride || COD.camera;
      try { COD.renderer.render(COD.scene, cam); } catch (e) { reportError('render', e); }
    }
    if (COD.input) COD.input.endFrame();

    if (ui.hint) {
      const show = COD.state.running && !COD.state.paused && !COD.state.uiMode && !COD.input.locked && !ui.over;
      ui.hint.style.display = show ? 'block' : 'none';
    }
    if (ui.mission) {
      const p = COD.player;
      const visible = p && p.alive && !COD.state.uiMode && !COD.state.paused && !ui.over;
      ui.mission.style.display = visible ? 'block' : 'none';
      ui.mission.textContent = p && p.vehicle && p.vehicle.auto
        ? 'BOAT INSERTION - Your squad will disembark automatically at the beach.'
        : p && p.vehicle ? 'WASD drive / steer  |  Space brake  |  E exit vehicle'
        : 'Capture A, B and C together to win  |  E interact  |  M island map  |  Esc pause';
    }
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    ui.root = document.getElementById('main-ui');
    // Registered before panel handlers: Escape closes a panel without also pausing.
    window.addEventListener('keydown', function (e) {
      if (e.code !== 'Escape' || e.repeat || !COD.state.running || COD.state.uiMode || ui.over) return;
      e.preventDefault();
      if (COD.state.paused) hidePause(); else showPause();
    });
    window.addEventListener('blur', function () {
      if (COD.state.running && !COD.state.uiMode) showPause();
    });
    // quick start for testing: index.html#play or #test (optional &size=2&teams=2)
    const h = (location.hash || '').replace('#', '');
    if (h) {
      const parts = h.split('&');
      parts.forEach(function (p) {
        const kv = p.split('=');
        if (kv[0] === 'size') sel.size = COD.clamp(parseInt(kv[1], 10) || 3, 1, 5);
        if (kv[0] === 'gfx') sel.gfx = kv[1] === 'low' ? 'low' : 'high';
        if (kv[0] === 'teams') sel.teams = COD.clamp(parseInt(kv[1], 10) || 4, 2, 4);
      });
      if (parts[0] === 'play') { startGame('normal'); return; }
      if (parts[0] === 'test') { startGame('test'); return; }
    }
    showMainMenu();
  }

  COD.main = { start: startGame, pause: showPause, resume: hidePause };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
