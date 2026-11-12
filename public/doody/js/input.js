/* Call of Doody - input.js : keyboard, mouse, pointer lock */
(function () {
  'use strict';
  const COD = window.COD;

  const keys = {};
  const down = {};          // went down this frame
  const mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
  let expectedUnlock = false;
  let canvas = null;
  let skipMove = false;

  const GAME_KEYS = { Tab: 1, Space: 1, KeyM: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ControlLeft: 1, ControlRight: 1 };
  const BROWSER_KEYS = { F1: 1, F3: 1, F5: 1, F6: 1, F7: 1, F10: 1, F12: 1 };

  function typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  const input = COD.input = {
    keys: keys,
    mouse: mouse,
    locked: false,
    touchActive: false,
    pressed: function (code) { return !!down[code]; },
    setKey: function (code, on) {
      on = !!on;
      if (on && !keys[code]) down[code] = true;
      keys[code] = on;
    },
    addLook: function (dx, dy) { mouse.dx += dx || 0; mouse.dy += dy || 0; },
    setFire: function (on) {
      on = !!on;
      if (on && !mouse.left) mouse.leftPressed = true;
      mouse.left = on;
    },
    setAim: function (on) {
      on = !!on;
      if (on && !mouse.right) mouse.rightPressed = true;
      mouse.right = on;
    },

    init: function () {
      canvas = (COD.renderer && COD.renderer.domElement) || document.getElementById('game-canvas');

      window.addEventListener('keydown', function (e) {
        if (typing(e)) return;
        // Cancel browser actions while retaining the actual game keys. For example,
        // Ctrl+W still means crouch + forward, instead of closing the game window.
        if (COD.state.running && (GAME_KEYS[e.code] || BROWSER_KEYS[e.code] || e.ctrlKey || e.metaKey ||
            (e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Home')))) e.preventDefault();
        if (!e.repeat) { if (!keys[e.code]) down[e.code] = true; }
        keys[e.code] = true;
      });
      window.addEventListener('keyup', function (e) { keys[e.code] = false; });
      window.addEventListener('blur', function () {
        for (const k in keys) keys[k] = false;
        mouse.left = mouse.right = false;
      });

      document.addEventListener('mousemove', function (e) {
        if (!input.locked) return;
        // drop the first move after (re)locking and any single bogus huge delta
        if (skipMove) { skipMove = false; return; }
        const mx = e.movementX || 0, my = e.movementY || 0;
        if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
        mouse.dx += mx;
        mouse.dy += my;
      });
      document.addEventListener('mousedown', function (e) {
        if (!COD.state.running) return;
        if (COD.audioResume) COD.audioResume();
        const onCanvas = e.target === canvas || e.target === document.body || e.target === document.documentElement;
        if (!input.locked) {
          // click on the game while unlocked -> capture the mouse (unless a panel is open)
          if (onCanvas && !COD.state.uiMode && !COD.state.paused) input.requestLock();
          return;
        }
        if (e.button === 0) { mouse.left = true; mouse.leftPressed = true; }
        if (e.button === 2) { mouse.right = true; mouse.rightPressed = true; }
      });
      document.addEventListener('mouseup', function (e) {
        if (e.button === 0) mouse.left = false;
        if (e.button === 2) mouse.right = false;
      });
      document.addEventListener('wheel', function (e) {
        if (!input.locked) return;
        mouse.wheel += e.deltaY > 0 ? 1 : (e.deltaY < 0 ? -1 : 0);
        e.preventDefault();
      }, { passive: false });
      document.addEventListener('contextmenu', function (e) { if (COD.state.running) e.preventDefault(); });

      document.addEventListener('pointerlockchange', function () {
        const was = input.locked;
        input.locked = document.pointerLockElement === canvas && canvas !== null;
        if (input.locked && (COD.state.paused || COD.state.uiMode)) {
          input.releaseLock();
          return;
        }
        if (!input.locked) {
          mouse.left = mouse.right = false;
          if (was) {
            const expected = expectedUnlock;
            expectedUnlock = false;
            COD.emit('unlocked', { expected: expected });
          }
        } else {
          skipMove = true;
          mouse.dx = mouse.dy = 0;
          COD.emit('locked', {});
        }
      });
      document.addEventListener('pointerlockerror', function () { /* ignore; user clicks again */ });
    },

    requestLock: function () {
      if (!COD.state.running || COD.state.paused || COD.state.uiMode) return;
      if (!canvas) canvas = (COD.renderer && COD.renderer.domElement) || document.getElementById('game-canvas');
      if (!canvas || !canvas.requestPointerLock) return;
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* ignore */ }
    },

    releaseLock: function () {
      if (!input.locked || !document.exitPointerLock) return;
      expectedUnlock = true;
      try { document.exitPointerLock(); } catch (e) { expectedUnlock = false; }
      mouse.left = mouse.right = false;
      mouse.leftPressed = mouse.rightPressed = false;
    },

    setUIMode: function (on) {
      on = !!on;
      COD.state.uiMode = on;
      if (on) {
        input.releaseLock();
        mouse.left = mouse.right = false;
        mouse.dx = mouse.dy = 0;
      }
      // on === false: re-lock happens on the next click (browser needs a user gesture)
    },

    update: function () { /* state is event-driven */ },

    endFrame: function () {
      for (const k in down) down[k] = false;
      mouse.dx = 0; mouse.dy = 0; mouse.wheel = 0;
      mouse.leftPressed = false; mouse.rightPressed = false;
    }
  };
})();
