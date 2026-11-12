(function () {
  'use strict';
  const COD = window.COD;

  let overlay = null, info = null, fireBtn = null;
  let cam = null, marker = null;
  let isOpen = false, actorRef = null, instRef = null;
  let target = null;                 // THREE.Vector3 or null
  const orbit = { yaw: 0.6, pitch: 0.9, dist: 240, cx: 0, cz: 0 };
  let drag = null;

  const CSS = '' +
    '#mortar-overlay{position:absolute;inset:0;display:none;pointer-events:auto;cursor:crosshair;user-select:none;font-family:monospace;color:#fff}' +
    '#mortar-overlay.mortar-on{display:block}' +
    '.mortar-top{position:absolute;top:14px;left:0;right:0;text-align:center;font-size:20px;text-shadow:0 0 6px #000}' +
    '.mortar-sub{position:absolute;top:44px;left:0;right:0;text-align:center;font-size:13px;color:#ddd;text-shadow:0 0 4px #000}' +
    '.mortar-info{position:absolute;bottom:90px;left:0;right:0;text-align:center;font-size:16px;text-shadow:0 0 6px #000}' +
    '.mortar-btns{position:absolute;bottom:30px;left:0;right:0;text-align:center}' +
    '.mortar-btn{cursor:pointer;font:bold 18px monospace;margin:0 8px;padding:10px 28px;border:2px solid #fff;background:rgba(0,0,0,.6);color:#fff;border-radius:4px}' +
    '.mortar-btn:hover{background:rgba(255,255,255,.2)}' +
    '#mortar-fire{border-color:#ff4444;color:#ff6666}#mortar-fire:disabled{opacity:.35;cursor:default}' +
    '.mortar-vig{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px rgba(0,0,0,.65)}';

  function el(cls, text, parent) {
    const d = document.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    if (parent) parent.appendChild(d);
    return d;
  }

  function init() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    overlay = document.createElement('div');
    overlay.id = 'mortar-overlay';
    el('mortar-vig', '', overlay);
    el('mortar-top', 'MORTAR TARGETING', overlay);
    el('mortar-sub', 'Drag: orbit  |  Wheel: zoom  |  WASD: pan  |  Click: pick target  |  Enter: fire  |  Esc: close', overlay);
    info = el('mortar-info', 'Click the map to pick a target', overlay);
    const btns = el('mortar-btns', '', overlay);
    fireBtn = document.createElement('button');
    fireBtn.id = 'mortar-fire'; fireBtn.className = 'mortar-btn'; fireBtn.textContent = 'FIRE';
    fireBtn.disabled = true;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mortar-btn'; closeBtn.textContent = 'CLOSE';
    btns.appendChild(fireBtn); btns.appendChild(closeBtn);
    const root = document.getElementById('ui-root') || document.body;
    root.appendChild(overlay);

    fireBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    closeBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    fireBtn.addEventListener('click', function (e) { e.stopPropagation(); fire(); });
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); close(); });

    overlay.addEventListener('mousedown', function (e) {
      if (e.button !== 0 && e.button !== 2) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
    });
    window.addEventListener('mousemove', function (e) {
      if (!isOpen || !drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      orbit.yaw -= dx * 0.006;
      orbit.pitch = COD.clamp(orbit.pitch + dy * 0.006, 0.25, 1.5);
    });
    window.addEventListener('mouseup', function (e) {
      if (!isOpen || !drag) return;
      const wasClick = drag.moved < 5 && e.button === 0;
      drag = null;
      if (wasClick && e.target && !(e.target.closest && e.target.closest('.mortar-btns'))) pick(e.clientX, e.clientY);
    });
    overlay.addEventListener('wheel', function (e) {
      e.preventDefault();
      orbit.dist = COD.clamp(orbit.dist * (e.deltaY > 0 ? 1.12 : 0.89), 40, 900);
    }, { passive: false });
    overlay.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.code === 'Escape') { close(); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') { fire(); }
    });
    window.addEventListener('resize', function () { if (cam) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); } });

    cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 5000);

    // target marker: ring + tall beam
    marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(9.2, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 10;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 120, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.45, depthTest: false }));
    beam.position.y = 60; beam.renderOrder = 10;
    marker.add(ring); marker.add(beam);
    marker.visible = false;
    COD.scene.add(marker);
  }

  function open(actor, inst) {
    if (isOpen || !overlay) return;
    if (!actor || !actor.alive || actor.hidden) return;
    isOpen = true; actorRef = actor; instRef = inst;
    target = null; marker.visible = false;
    orbit.cx = actor.pos.x; orbit.cz = actor.pos.z;
    orbit.yaw = actor.yaw + Math.PI;
    orbit.pitch = 0.9; orbit.dist = 220;
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    updateCam();
    COD.state.cameraOverride = cam;
    if (COD.input && COD.input.setUIMode) COD.input.setUIMode(true);
    overlay.classList.add('mortar-on');
    refreshInfo();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false; drag = null;
    overlay.classList.remove('mortar-on');
    marker.visible = false;
    if (COD.state.cameraOverride === cam) COD.state.cameraOverride = null;
    if (COD.input && COD.input.setUIMode) COD.input.setUIMode(false);
  }

  function refreshInfo() {
    const shells = actorRef ? (actorRef.ammo.mortar | 0) : 0;
    let txt = 'Shells: ' + shells + '   ';
    if (target) {
      const d = Math.round(Math.hypot(target.x - actorRef.pos.x, target.z - actorRef.pos.z));
      txt += 'Target set (' + d + ' m away) - press FIRE';
    } else txt += 'Click the map to pick a target';
    info.textContent = txt;
    fireBtn.disabled = !(target && shells > 0);
  }

  function pick(cx, cy) {
    updateCam();
    const v = new THREE.Vector3((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1, 0.5).unproject(cam);
    const dir = v.sub(cam.position).normalize();
    let pt = null;
    if (COD.world && COD.world.raycast) {
      const h = COD.world.raycast(cam.position, dir, 4000);
      if (h) pt = h.point.clone();
    }
    if (!pt && dir.y < -0.01) {
      const t = -cam.position.y / dir.y;
      pt = cam.position.clone().addScaledVector(dir, t);
    }
    if (!pt) return;
    if (COD.world && COD.world.isWater && COD.world.isWater(pt.x, pt.z)) pt.y = 0;
    target = pt;
    marker.position.copy(pt);
    marker.visible = true;
    if (COD.sfx) COD.sfx('hit');
    refreshInfo();
  }

  function fire() {
    if (!isOpen || !target || !actorRef) return;
    if ((actorRef.ammo.mortar | 0) <= 0) { refreshInfo(); return; }
    actorRef.ammo.mortar -= 1;
    if (instRef) instRef.ammoInMag = actorRef.ammo.mortar > 0 ? 1 : 0;
    if (COD.projectiles) COD.projectiles.fireMortar(actorRef, target.clone(), instRef);
    if (COD.emit) COD.emit('message', { text: 'MORTAR INBOUND' });
    close();
  }

  function updateCam() {
    const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
    const gy = COD.world && COD.world.heightAt ? Math.max(0, COD.world.heightAt(orbit.cx, orbit.cz)) : 0;
    cam.position.set(orbit.cx + Math.sin(orbit.yaw) * cp * orbit.dist,
      gy + sp * orbit.dist,
      orbit.cz + Math.cos(orbit.yaw) * cp * orbit.dist);
    if (COD.world && COD.world.heightAt) {
      const floor = COD.world.heightAt(cam.position.x, cam.position.z) + 6;
      if (cam.position.y < floor) cam.position.y = floor;
    }
    cam.lookAt(orbit.cx, gy, orbit.cz);
    cam.updateMatrixWorld(true);
  }

  function update(dt) {
    if (!isOpen) return;
    if (!actorRef.alive || actorRef.hidden) { close(); return; }
    // WASD pan relative to the view direction
    const k = COD.input && COD.input.keys;
    if (k) {
      const sp = orbit.dist * 0.8 * dt;
      const fx = -Math.sin(orbit.yaw), fz = -Math.cos(orbit.yaw);
      let mx = 0, mz = 0;
      if (k.KeyW) { mx += fx; mz += fz; }
      if (k.KeyS) { mx -= fx; mz -= fz; }
      if (k.KeyD) { mx -= fz; mz += fx; }
      if (k.KeyA) { mx += fz; mz -= fx; }
      orbit.cx = COD.clamp(orbit.cx + mx * sp, -400, 400);
      orbit.cz = COD.clamp(orbit.cz + mz * sp, -400, 400);
    }
    updateCam();
    if (marker.visible) marker.rotation.y += dt;
    refreshInfo();
  }

  COD.mortar = {
    init: init, update: update, open: open, close: close,
    get isOpen() { return isOpen; }
  };
})();
