/* Samsung / Android touch controls for Call of Doody */
(function () {
  'use strict';
  const COD = window.COD;
  if (!COD) return;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const android = /Android/i.test(navigator.userAgent) || window.COD_ANDROID;
  if (!coarse && !android) return;

  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.innerHTML = '<div class="touch-look"></div><div class="touch-stick"><div class="touch-stick-knob"></div></div>' +
    '<div class="touch-actions"><button class="touch-btn fire" data-hold="fire">FIRE</button><button class="touch-btn aim" data-hold="aim">AIM</button>' +
    '<button class="touch-btn jump" data-key="Space">JUMP</button><button class="touch-btn reload" data-key="KeyR">RELOAD</button>' +
    '<button class="touch-btn use" data-key="KeyE">USE</button><button class="touch-btn crouch" data-toggle="KeyC">CROUCH</button>' +
    '<button class="touch-btn drop" data-key="KeyQ">DROP</button><button class="touch-btn grenade" data-key="KeyG">GRENADE</button></div>' +
    '<button class="touch-pause" data-key="Escape">Ⅱ</button>';
  document.body.appendChild(root);

  function input() { return COD.input; }
  function pulse(code) {
    const i = input(); if (!i || !i.setKey) return;
    i.setKey(code, true); setTimeout(function () { i.setKey(code, false); }, 80);
  }
  root.querySelectorAll('[data-key]').forEach(function (button) {
    button.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); pulse(button.dataset.key); });
  });
  root.querySelectorAll('[data-toggle]').forEach(function (button) {
    let on = false;
    button.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation(); on = !on; button.classList.toggle('held', on);
      const i = input(); if (i && i.setKey) i.setKey(button.dataset.toggle, on);
    });
  });
  root.querySelectorAll('[data-hold]').forEach(function (button) {
    function set(on) {
      button.classList.toggle('held', on); const i = input(); if (!i) return;
      if (button.dataset.hold === 'fire' && i.setFire) i.setFire(on);
      if (button.dataset.hold === 'aim' && i.setAim) i.setAim(on);
    }
    button.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); button.setPointerCapture(e.pointerId); set(true); });
    button.addEventListener('pointerup', function (e) { e.preventDefault(); set(false); });
    button.addEventListener('pointercancel', function () { set(false); });
  });

  const stick = root.querySelector('.touch-stick'), knob = root.querySelector('.touch-stick-knob');
  let stickId = null;
  function moveStick(e) {
    const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = (e.clientX - cx) / (r.width * .34), y = (e.clientY - cy) / (r.height * .34);
    const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
    knob.style.transform = 'translate(calc(-50% + ' + (x * r.width * .28) + 'px),calc(-50% + ' + (y * r.height * .28) + 'px))';
    const i = input(); if (!i || !i.setKey) return;
    i.setKey('KeyA', x < -.22); i.setKey('KeyD', x > .22); i.setKey('KeyW', y < -.22); i.setKey('KeyS', y > .22);
  }
  function releaseStick() {
    stickId = null; knob.style.transform = 'translate(-50%,-50%)'; const i = input(); if (!i || !i.setKey) return;
    ['KeyA','KeyD','KeyW','KeyS'].forEach(function (k) { i.setKey(k, false); });
  }
  stick.addEventListener('pointerdown', function (e) { e.preventDefault(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
  stick.addEventListener('pointermove', function (e) { if (e.pointerId === stickId) moveStick(e); });
  stick.addEventListener('pointerup', releaseStick); stick.addEventListener('pointercancel', releaseStick);

  const look = root.querySelector('.touch-look'); let lookId = null, lx = 0, ly = 0;
  look.addEventListener('pointerdown', function (e) { if (e.target !== look) return; e.preventDefault(); lookId = e.pointerId; lx = e.clientX; ly = e.clientY; look.setPointerCapture(e.pointerId); });
  look.addEventListener('pointermove', function (e) { if (e.pointerId !== lookId) return; e.preventDefault(); const i = input(); if (i && i.addLook) i.addLook((e.clientX-lx)*1.35,(e.clientY-ly)*1.35); lx=e.clientX; ly=e.clientY; });
  function releaseLook(e) { if (!e || e.pointerId === lookId) lookId = null; }
  look.addEventListener('pointerup', releaseLook); look.addEventListener('pointercancel', releaseLook);

  setInterval(function () {
    const i = input(); if (i) i.touchActive = true;
    const show = !!(COD.state && COD.state.running && !COD.state.uiMode);
    root.classList.toggle('active', show);
  }, 120);
})();
