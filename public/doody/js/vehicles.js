// vehicles.js - driveable cars and boats, team boat landing, vehicle camera. Owner: Chat 7.
// v.control = {throttle: -1..1, steer: -1..1}; steer +1 = turn LEFT (yaw increases).
// While COD.player.vehicle is set, THIS file owns COD.camera (set at the end of update()).
(function () {
  'use strict';
  const COD = window.COD;

  const list = [];
  const spots = [];        // original spawn spots for respawn
  let root = null;
  let nextId = 1;
  let engineTimer = 0;
  const geo = {};
  const matCache = {};
  const boxCache = {};
  const CAR_COLORS = [0xc0392b, 0x2c6fbb, 0xe0c020, 0x2e8b57, 0xdddddd, 0x222222, 0xe67e22, 0x7b3fa0];
  const CAR_STYLES = [
    { name: 'sedan', roof: 1.55 },
    { name: 'suv',   roof: 1.78 },
    { name: 'coupe', roof: 1.45 },
  ];
  const BOAT_DECK = 0.25;

  const TYPES = {
    car:  { seats: [[-0.4, -0.1], [0.4, -0.1], [-0.4, 1.0], [0.4, 1.0]], maxF: 26, maxR: 8, accel: 16, turn: 1.9, hp: 300, radius: 1.3, seatY: -0.3 },
    boat: { seats: [[0, -0.3], [-0.5, 0.7], [0.5, 0.7], [-0.5, 1.7], [0.5, 1.7], [0, 2.6]], maxF: 20, maxR: 6, accel: 9, turn: 1.1, hp: 250, radius: 2.0, seatY: 0.25 },
  };

  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _zAxis = new THREE.Vector3(0, 0, 1);

  // ---------- small build helpers ----------
  function gfxHigh() { return !COD.config || COD.config.gfx !== 'low'; }

  function mat(color, extra) {
    const k = color + (extra ? JSON.stringify(extra) : '');
    if (!matCache[k]) {
      const o = { color: color, roughness: 0.55, metalness: 0.35 };
      if (extra) for (const p in extra) o[p] = extra[p];
      matCache[k] = new THREE.MeshStandardMaterial(o);
    }
    return matCache[k];
  }
  function paintMat(color) {
    const k = 'paint' + color;
    if (!matCache[k]) {
      matCache[k] = new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.38, metalness: 0.55,
        clearcoat: 0.8, clearcoatRoughness: 0.12 });
    }
    return matCache[k];
  }
  function glassMat() {
    if (!matCache.glass) {
      matCache.glass = new THREE.MeshStandardMaterial({ color: 0x8fb8d0, roughness: 0.05, metalness: 0.2,
        transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    }
    return matCache.glass;
  }
  function boxGeo(w, h, d) {
    const k = w + 'x' + h + 'x' + d;
    return boxCache[k] || (boxCache[k] = new THREE.BoxGeometry(w, h, d));
  }
  function bx(g, w, h, d, m, x, y, z, rx, ry, rz) {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
    mesh.position.set(x, y, z);
    if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0);
    g.add(mesh); return mesh;
  }
  // thin bar from point a to point b
  function bar(g, m, ax, ay, az, bx_, by, bz, th) {
    _v1.set(bx_ - ax, by - ay, bz - az);
    const len = _v1.length();
    const mesh = new THREE.Mesh(boxGeo(1, 1, 1), m);
    mesh.scale.set(th, th, len);
    mesh.position.set((ax + bx_) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.quaternion.copy(_q.setFromUnitVectors(_zAxis, _v1.normalize()));
    g.add(mesh); return mesh;
  }
  function finishShadows(g) {
    const high = gfxHigh();
    g.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = high && !(o.material && o.material.transparent);
      o.receiveShadow = false;
    });
  }
  function softTex() {
    if (geo.softTex) return geo.softTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return (geo.softTex = t);
  }
  function plateMat() {
    if (matCache.plate) return matCache.plate;
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = '#f2f2ee'; x.fillRect(0, 0, 128, 32);
    x.strokeStyle = '#223'; x.lineWidth = 2; x.strokeRect(1, 1, 126, 30);
    x.fillStyle = '#1a2a6a'; x.font = 'bold 22px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('COD 217', 64, 17);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return (matCache.plate = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  }
  function woodMat() {
    if (matCache.deck) return matCache.deck;
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const sh = 150 + Math.floor(Math.random() * 40);
      x.fillStyle = 'rgb(' + sh + ',' + Math.floor(sh * 0.78) + ',' + Math.floor(sh * 0.5) + ')';
      x.fillRect(i * 32, 0, 32, 256);
      x.fillStyle = 'rgba(40,25,10,0.55)'; x.fillRect(i * 32, 0, 2, 256);
    }
    for (let k = 0; k < 300; k++) {
      x.fillStyle = 'rgba(60,35,15,' + (Math.random() * 0.12) + ')';
      x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 8 + Math.random() * 30);
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (matCache.deck = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, metalness: 0.0 }));
  }
  function wakeTex() {
    if (geo.wakeTex) return geo.wakeTex;
    const W = 256, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < 3; k++) {
        x.strokeStyle = 'rgba(255,255,255,' + (0.5 - k * 0.12) + ')';
        x.lineWidth = 30 - k * 8;
        x.beginPath(); x.moveTo(W / 2 + s * 18, 6); x.lineTo(W / 2 + s * (100 + k * 6), H - 10); x.stroke();
      }
    }
    const cg = x.createLinearGradient(W / 2 - 40, 0, W / 2 + 40, 0);
    cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(0.5, 'rgba(255,255,255,0.65)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = cg; x.fillRect(W / 2 - 40, 0, 80, H);
    for (let n = 0; n < 500; n++) {
      x.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.35 + ')';
      x.beginPath(); x.arc(Math.random() * W, Math.random() * H * 0.8, 1 + Math.random() * 3, 0, 6.3); x.fill();
    }
    x.globalCompositeOperation = 'destination-in';
    const fade = x.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.65, 'rgba(0,0,0,0.5)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = fade; x.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return (geo.wakeTex = t);
  }

  // ---------- car ----------
  function buildCar() {
    const g = new THREE.Group();
    const st = COD.pick(CAR_STYLES), RY = st.roof;
    const color = COD.pick(CAR_COLORS);
    const paint = paintMat(color);
    const dark = mat(0x16181b, { roughness: 0.8, metalness: 0.1 });
    const chrome = mat(0xd8dce0, { roughness: 0.2, metalness: 0.9 });
    const glass = glassMat();
    const seatM = mat(0x2b2b30, { roughness: 0.9, metalness: 0 });
    const BY = 0.95;   // beltline

    // underbody + interior floor
    bx(g, 1.9, 0.06, 4.3, dark, 0, 0.33, 0);
    bx(g, 1.7, 0.02, 2.7, mat(0x3a3a40, { roughness: 1, metalness: 0 }), 0, 0.37, 0.2);
    // side panels around the wheel arches
    [-1, 1].forEach(function (s) {
      const x = s * 0.95;
      bx(g, 0.1, 0.58, 0.3, paint, x, 0.61, -2.05);                  // front of fender
      bx(g, 0.1, 0.17, 1.0, paint, x, 0.865, -1.4);                  // over front wheel
      bx(g, 0.1, 0.63, 1.8, paint, x, 0.635, 0.0);                   // doors + sill
      bx(g, 0.1, 0.2, 1.0, paint, x, 0.88, 1.4);                     // over rear wheel
      bx(g, 0.1, 0.58, 0.3, paint, x, 0.61, 2.05);                   // rear of quarter
      bx(g, 0.012, 0.58, 0.02, dark, s * 1.005, 0.65, 0.3);           // door seams
      bx(g, 0.012, 0.58, 0.02, dark, s * 1.005, 0.65, -0.9);
      bx(g, 0.012, 0.58, 0.02, dark, s * 1.005, 0.65, 0.9);
      bx(g, 0.04, 0.05, 0.22, chrome, s * 1.02, 0.84, -0.05);        // handles
      bx(g, 0.04, 0.05, 0.22, chrome, s * 1.02, 0.84, 0.65);
      bx(g, 0.14, 0.1, 0.12, paint, s * 1.07, 1.02, -0.88);          // mirrors
      bx(g, 0.04, 0.06, 0.1, dark, s * 1.07, 1.02, -0.88);
      bx(g, 0.04, 0.05, 4.0, dark, s * 1.01, 0.33, 0);               // sill trim
    });
    // hood, grille, bumpers
    bx(g, 1.9, 0.1, 1.3, paint, 0, 0.9, -1.55);
    bx(g, 1.9, 0.5, 0.1, paint, 0, 0.62, -2.15);
    bx(g, 1.9, 0.1, 0.18, paint, 0, 0.9, -0.95);
    bx(g, 1.1, 0.22, 0.04, dark, 0, 0.64, -2.21);
    bx(g, 1.15, 0.03, 0.05, chrome, 0, 0.77, -2.21);
    bx(g, 1.15, 0.03, 0.05, chrome, 0, 0.52, -2.21);
    bx(g, 1.98, 0.2, 0.22, dark, 0, 0.42, -2.2);
    bx(g, 1.98, 0.2, 0.22, dark, 0, 0.42, 2.2);
    bx(g, 0.5, 0.12, 0.02, dark, 0, 0.48, -2.33);
    // trunk
    bx(g, 1.9, 0.1, 0.78, paint, 0, 0.95, 1.85);
    bx(g, 1.9, 0.56, 0.1, paint, 0, 0.65, 2.15);
    // lights
    const hl = mat(0xfff4c0, { emissive: 0xffeeaa, emissiveIntensity: 1.1, roughness: 0.2 });
    [-1, 1].forEach(function (s) {
      bx(g, 0.4, 0.17, 0.06, chrome, s * 0.68, 0.76, -2.2);
      bx(g, 0.34, 0.12, 0.07, hl, s * 0.68, 0.76, -2.21);
      bx(g, 0.2, 0.05, 0.06, hl, s * 0.68, 0.6, -2.22);
    });
    const tails = [];
    [-1, 1].forEach(function (s) {
      const t = bx(g, 0.4, 0.16, 0.07, matTailOff(), s * 0.68, 0.8, 2.21);
      tails.push(t);
    });
    // licence plates
    const pm = plateMat();
    const pf = new THREE.Mesh(geo.plate, pm); pf.position.set(0, 0.5, -2.325); pf.rotation.y = Math.PI; g.add(pf);
    const pr = new THREE.Mesh(geo.plate, pm); pr.position.set(0, 0.5, 2.215); g.add(pr);

    // cabin: roof, pillars, glass
    bx(g, 1.94, 0.07, 1.62, paint, 0, RY, 0.3);
    bx(g, 1.7, 0.02, 1.4, mat(0x77777e, { roughness: 1, metalness: 0 }), 0, RY - 0.05, 0.3);  // headliner
    [-1, 1].forEach(function (s) {
      bar(g, paint, s * 0.93, BY, -1.0, s * 0.93, RY, -0.5, 0.07);            // A pillar
      bar(g, paint, s * 0.95, BY, 0.35, s * 0.95, RY, 0.35, 0.08);            // B pillar
      bar(g, paint, s * 0.93, BY + 0.03, 1.5, s * 0.93, RY, 1.1, 0.09);        // C pillar
      bar(g, dark, s * 0.95, BY + 0.02, -0.97, s * 0.95, BY + 0.02, 1.47, 0.04); // window sill line
    });
    // windshield and rear glass (tilted panes)
    const wsH = Math.hypot(RY - BY, 0.5), wsA = Math.atan2(0.5, RY - BY);
    bx(g, 1.82, wsH, 0.02, glass, 0, (RY + BY) / 2, -0.75, wsA, 0, 0);
    const rgH = Math.hypot(RY - BY - 0.03, 0.4), rgA = Math.atan2(-0.4, RY - BY - 0.03);
    bx(g, 1.82, rgH, 0.02, glass, 0, (RY + BY + 0.03) / 2, 1.3, rgA, 0, 0);
    // side glass (trapezoid)
    if (!geo.sideGlass) geo.sideGlass = {};
    const gk = RY.toFixed(2);
    if (!geo.sideGlass[gk]) {
      const sh = new THREE.Shape();
      sh.moveTo(0.97, BY + 0.03); sh.lineTo(-1.47, BY + 0.03); sh.lineTo(-1.1, RY - 0.03); sh.lineTo(0.5, RY - 0.03); sh.closePath();
      const sg = new THREE.ShapeGeometry(sh); sg.rotateY(Math.PI / 2);
      geo.sideGlass[gk] = sg;
    }
    [-1, 1].forEach(function (s) {
      const m = new THREE.Mesh(geo.sideGlass[gk], glass); m.position.x = s * 0.96; g.add(m);
    });

    // interior: dashboard, wheel, seats, console
    bx(g, 1.84, 0.16, 0.4, dark, 0, 0.88, -0.82);
    bx(g, 1.84, 0.03, 0.18, mat(0x25272b, { roughness: 0.6, metalness: 0.1 }), 0, 0.975, -0.9);
    bx(g, 0.34, 0.07, 0.03, mat(0x14181a, { emissive: 0x0f3a2a, emissiveIntensity: 0.25, roughness: 0.4 }), -0.4, 0.97, -0.64, -0.5, 0, 0);   // dim gauge cluster
    bx(g, 0.24, 0.24, 1.1, mat(0x1d1f23, { roughness: 0.8 }), 0, 0.5, 0.2);                                     // centre console
    const pivot = new THREE.Group(); pivot.position.set(-0.4, 0.98, -0.52); pivot.rotation.x = -0.95; g.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const ring = new THREE.Mesh(geo.steerRing, mat(0x15161a, { roughness: 0.7, metalness: 0.2 })); spin.add(ring);
    bx(spin, 0.3, 0.035, 0.035, dark, 0, 0, 0); bx(spin, 0.035, 0.17, 0.035, dark, 0, -0.08, 0);
    bx(g, 0.06, 0.06, 0.4, dark, -0.4, 0.88, -0.65);                                                             // column
    TYPES.car.seats.forEach(function (s) {
      bx(g, 0.5, 0.13, 0.5, seatM, s[0], 0.5, s[1] + 0.05);
      bx(g, 0.5, 0.66, 0.11, seatM, s[0], 0.88, s[1] + 0.34, 0.14, 0, 0);
      bx(g, 0.26, 0.2, 0.1, seatM, s[0], 1.28, s[1] + 0.4);
    });

    // body style extras
    if (st.name === 'suv') {
      bar(g, dark, -0.8, RY + 0.08, -0.3, -0.8, RY + 0.08, 1.0, 0.045);
      bar(g, dark, 0.8, RY + 0.08, -0.3, 0.8, RY + 0.08, 1.0, 0.045);
      bar(g, dark, -0.8, RY + 0.08, 0.0, 0.8, RY + 0.08, 0.0, 0.04);
      bar(g, dark, -0.8, RY + 0.08, 0.8, 0.8, RY + 0.08, 0.8, 0.04);
    } else if (st.name === 'coupe') {
      bx(g, 1.7, 0.05, 0.3, paint, 0, 1.12, 2.0);
      bx(g, 0.06, 0.2, 0.2, dark, -0.6, 1.02, 2.0); bx(g, 0.06, 0.2, 0.2, dark, 0.6, 1.02, 2.0);
    } else {
      bar(g, dark, 0.7, 0.98, 1.9, 0.75, 1.5, 2.0, 0.015);
    }

    // wheels (front pair steers)
    g.userData.spins = []; g.userData.steerHolders = [];
    [[-1, -1.4, true], [1, -1.4, true], [-1, 1.4, false], [1, 1.4, false]].forEach(function (p) {
      const holder = new THREE.Group(); holder.position.set(p[0] * 0.9, 0.38, p[1]); g.add(holder);
      const sp = new THREE.Group(); holder.add(sp);
      const tyre = new THREE.Mesh(geo.tyre, mat(0x111111, { roughness: 0.95, metalness: 0 })); tyre.rotation.z = Math.PI / 2; sp.add(tyre);
      const rim = new THREE.Mesh(geo.rim, chrome); rim.rotation.z = Math.PI / 2; rim.position.x = p[0] * 0.01; sp.add(rim);
      for (let k = 0; k < 5; k++) {
        bx(sp, 0.04, 0.04, 0.4, dark, p[0] * 0.15, 0, 0, k * 0.628, 0, 0);
      }
      g.userData.spins.push(sp);
      if (p[2]) g.userData.steerHolders.push(holder);
    });

    // visible driver (only shown in chase view)
    const drv = new THREE.Group(); drv.position.set(-0.4, 0, -0.05);
    bx(drv, 0.42, 0.55, 0.24, mat(0x3b4a5a, { roughness: 0.9, metalness: 0 }), 0, 0.9, 0.12, 0.1, 0, 0);
    const head = new THREE.Mesh(geo.head, mat(0xd9a77f, { roughness: 0.8, metalness: 0 })); head.position.set(0, 1.3, 0.1); drv.add(head);
    const helm = new THREE.Mesh(geo.helm, mat(0x2d3b2d, { roughness: 0.6, metalness: 0.2 })); helm.position.set(0, 1.33, 0.1); drv.add(helm);
    bar(drv, mat(0x3b4a5a, { roughness: 0.9, metalness: 0 }), -0.2, 1.0, 0.08, -0.12, 0.98, -0.42, 0.09);
    bar(drv, mat(0x3b4a5a, { roughness: 0.9, metalness: 0 }), 0.2, 1.0, 0.08, 0.12, 0.98, -0.42, 0.09);
    g.add(drv);

    g.userData.tails = tails;
    g.userData.steerWheel = spin;
    g.userData.driverDummy = drv;
    g.userData.eye = new THREE.Vector3(-0.4, Math.min(RY - 0.28, 1.4), -0.02);
    g.userData.style = st.name;
    finishShadows(g);
    return g;
  }
  function matTailOff() {
    return matCache.tailOff || (matCache.tailOff = mat(0x9a1010, { emissive: 0x4a0000, emissiveIntensity: 0.55, roughness: 0.3 }));
  }
  function matTailOn() {
    return matCache.tailOn || (matCache.tailOn = mat(0xff2222, { emissive: 0xff1111, emissiveIntensity: 1.6, roughness: 0.3 }));
  }

  // ---------- boat ----------
  const STATIONS = [3.3, 2.6, 1.8, 0.8, -0.2, -0.6, -1.1, -1.6, -2.1, -2.6, -3.0, -3.35, -3.6, -3.78, -3.9];
  function bProf(z) {
    if (z >= -0.6) return z > 2.4 ? 1.2 + (3.3 - z) * -0.0 + (z - 2.4) * -0.1 : 1.3;
    const t = Math.min(1, (-0.6 - z) / 3.3);
    return 1.3 * Math.pow(Math.max(0, 1 - Math.pow(t, 1.5)), 0.7);
  }
  function bowT(z) { return Math.max(0, Math.min(1, (-1.5 - z) / 2.4)); }
  function gTop(z) { return 0.95 + 0.25 * Math.pow(bowT(z), 1.5); }
  function keelY(z) { return -0.45 + 0.85 * Math.pow(bowT(z), 1.6); }
  function wlY(z) { return Math.max(0.05, keelY(z) + 0.12); }

  function buildHullGeo() {
    const rows = 7, n = STATIONS.length;
    const pos = [], col = [], idx = [];
    const white = new THREE.Color(0xf4f4f0), blue = new THREE.Color(0x1e5fb0), navy = new THREE.Color(0x0e2e5c);
    for (let i = 0; i < n; i++) {
      const z = STATIONS[i], b = bProf(z), gt = gTop(z), wl = wlY(z), ky = keelY(z), wx = 0.84 * b;
      const pts = [[-b, gt, white], [-wx, wl, white], [-wx, wl, blue], [0, ky, navy], [wx, wl, blue], [wx, wl, white], [b, gt, white]];
      for (let r = 0; r < rows; r++) {
        pos.push(pts[r][0], pts[r][1], z);
        col.push(pts[r][2].r, pts[r][2].g, pts[r][2].b);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let r = 0; r < rows - 1; r++) {
        const a = i * rows + r, b2 = a + 1, c = a + rows, d = c + 1;
        idx.push(a, c, b2, b2, c, d);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    return geom;
  }
  function stripGeo(zFrom, zTo, yFn, wFn, uvScale) {
    const pos = [], uv = [], idx = [];
    const cnt = [];
    STATIONS.forEach(function (z) { if (z <= zFrom + 1e-6 && z >= zTo - 1e-6) cnt.push(z); });
    if (cnt[0] !== zFrom) cnt.unshift(zFrom);
    if (cnt[cnt.length - 1] !== zTo) cnt.push(zTo);
    cnt.forEach(function (z) {
      const w = wFn(z), y = yFn(z);
      pos.push(-w, y, z, w, y, z);
      uv.push(0.5 - w / uvScale, z / uvScale, 0.5 + w / uvScale, z / uvScale);
    });
    for (let i = 0; i < cnt.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function ensureBoatGeo() {
    if (geo.hull) return;
    geo.hull = buildHullGeo();
    const deckW = function (z) { const b = bProf(z), wl = wlY(z), gt = gTop(z); return (0.84 * b + 0.16 * b * (BOAT_DECK - wl) / (gt - wl)) * 0.99; };
    geo.deck = stripGeo(3.28, -1.9, function () { return BOAT_DECK; }, deckW, 2.6);
    geo.foredeck = stripGeo(-1.9, -3.88, gTop, function (z) { return bProf(z) * 0.985; }, 2.6);
    // transom
    const tz = 3.3, b = bProf(tz), gt = gTop(tz), wl = wlY(tz), ky = keelY(tz), wx = 0.84 * b;
    const tp = [-b, gt, tz, -wx, wl, tz, 0, ky, tz, wx, wl, tz, b, gt, tz];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    tg.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    tg.computeVertexNormals();
    geo.transom = tg;
    // gunwale & bow-rail tubes
    function gunPts(s) {
      const a = []; for (let i = 0; i < STATIONS.length - 1; i++) { const z = STATIONS[i]; a.push(new THREE.Vector3(s * bProf(z), gTop(z) + 0.02, z)); }
      return a;
    }
    geo.gunL = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gunPts(-1)), 70, 0.045, 6, false);
    geo.gunR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gunPts(1)), 70, 0.045, 6, false);
    const rp = [];
    [-2.0, -2.5, -3.0, -3.4, -3.65].forEach(function (z) { rp.push(new THREE.Vector3(-bProf(z) * 0.93, gTop(z) + 0.38, z)); });
    rp.push(new THREE.Vector3(0, gTop(-3.78) + 0.42, -3.78));
    [-3.65, -3.4, -3.0, -2.5, -2.0].forEach(function (z) { rp.push(new THREE.Vector3(bProf(z) * 0.93, gTop(z) + 0.38, z)); });
    geo.rail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp), 60, 0.022, 6, false);
    geo.railPosts = [-2.0, -2.7, -3.3].map(function (z) { return z; });
  }

  function buildBoat() {
    ensureBoatGeo();
    const g = new THREE.Group();
    const D = BOAT_DECK;
    const chrome = mat(0xd8dce0, { roughness: 0.2, metalness: 0.9 });
    const dark = mat(0x23262b, { roughness: 0.7, metalness: 0.3 });
    const hullOut = new THREE.Mesh(geo.hull, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.15 }));
    g.add(hullOut);
    const hullIn = new THREE.Mesh(geo.hull, new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.6, metalness: 0.05, side: THREE.BackSide }));
    g.add(hullIn);
    const transom = new THREE.Mesh(geo.transom, new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.4, side: THREE.DoubleSide }));
    g.add(transom);
    const deck = new THREE.Mesh(geo.deck, woodMat()); g.add(deck);
    const fore = new THREE.Mesh(geo.foredeck, new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide })); g.add(fore);
    bx(g, 2.5, 0.7, 0.05, mat(0xe9e2cf, { roughness: 0.6 }), 0, 0.6, -1.9);   // bulkhead
    g.add(new THREE.Mesh(geo.gunL, dark)); g.add(new THREE.Mesh(geo.gunR, dark));
    g.add(new THREE.Mesh(geo.rail, chrome));
    geo.railPosts.forEach(function (z) {
      [-1, 1].forEach(function (s) {
        const x = s * bProf(z) * 0.93, y0 = gTop(z);
        bx(g, 0.04, 0.38, 0.04, chrome, x, y0 + 0.19, z);
      });
    });
    bx(g, 0.04, 0.45, 0.04, chrome, 0, gTop(-3.78) + 0.22, -3.78);
    // bow nav lights
    bx(g, 0.1, 0.08, 0.1, mat(0xff2222, { emissive: 0xff0000, emissiveIntensity: 0.9 }), -0.55, gTop(-3.3) + 0.06, -3.3);
    bx(g, 0.1, 0.08, 0.1, mat(0x22ff44, { emissive: 0x00ff22, emissiveIntensity: 0.9 }), 0.55, gTop(-3.3) + 0.06, -3.3);

    // console + windshield
    bx(g, 1.5, 0.7, 0.6, mat(0xf0f0ec, { roughness: 0.4 }), 0, D + 0.35, -1.2);
    bx(g, 1.3, 0.04, 0.5, dark, 0, D + 0.72, -1.17);
    bx(g, 0.34, 0.03, 0.2, mat(0x66ffcc, { emissive: 0x33ffaa, emissiveIntensity: 0.9 }), 0, D + 0.75, -1.02);   // screen
    const wsFrame = mat(0xb8bcc2, { roughness: 0.3, metalness: 0.8 });
    bx(g, 1.62, 0.04, 0.05, wsFrame, 0, D + 1.27, -1.38, -0.2, 0, 0);
    bar(g, wsFrame, -0.78, D + 0.7, -1.5, -0.78, D + 1.27, -1.38, 0.045);
    bar(g, wsFrame, 0.78, D + 0.7, -1.5, 0.78, D + 1.27, -1.38, 0.045);
    bx(g, 1.5, 0.58, 0.02, glassMat(), 0, D + 0.98, -1.44, -0.2, 0, 0);
    const pivot = new THREE.Group(); pivot.position.set(0, D + 0.82, -0.98); pivot.rotation.x = -1.0; g.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    spin.add(new THREE.Mesh(geo.steerRing, dark)); bx(spin, 0.3, 0.035, 0.035, dark, 0, 0, 0); bx(spin, 0.035, 0.17, 0.035, dark, 0, -0.08, 0);
    // seats
    const seatM = mat(0xece6d8, { roughness: 0.7, metalness: 0 });
    bx(g, 0.1, 0.32, 0.1, dark, 0, D + 0.16, -0.3);
    bx(g, 0.55, 0.14, 0.5, seatM, 0, D + 0.4, -0.3);
    bx(g, 0.55, 0.55, 0.1, seatM, 0, D + 0.7, -0.05, 0.1, 0, 0);
    [0.7, 1.7].forEach(function (z) {
      bx(g, 1.5, 0.14, 0.5, seatM, 0, D + 0.3, z);
      bx(g, 1.5, 0.5, 0.1, seatM, 0, D + 0.58, z + 0.26, 0.1, 0, 0);
    });
    bx(g, 1.0, 0.14, 0.45, seatM, 0, D + 0.3, 2.65);
    bx(g, 1.0, 0.45, 0.1, seatM, 0, D + 0.55, 2.9, 0.1, 0, 0);
    // outboard motor (turns with steering)
    const motor = new THREE.Group(); motor.position.set(0, 0.62, 3.42); g.add(motor);
    bx(motor, 0.62, 0.62, 0.78, mat(0x2a2d34, { roughness: 0.4, metalness: 0.5 }), 0, 0.15, 0.1);
    bx(motor, 0.64, 0.14, 0.8, mat(0xcc2222, { roughness: 0.4, metalness: 0.4 }), 0, 0.5, 0.1);
    bx(motor, 0.22, 1.1, 0.4, mat(0x2a2d34, { roughness: 0.4, metalness: 0.5 }), 0, -0.55, 0.3);
    bx(motor, 0.28, 0.28, 0.7, mat(0x2a2d34, { roughness: 0.4, metalness: 0.5 }), 0, -1.1, 0.45);
    const prop = new THREE.Group(); prop.position.set(0, -1.1, 0.88); motor.add(prop);
    for (let k = 0; k < 3; k++) { const bl = bx(prop, 0.08, 0.5, 0.03, chrome, 0, 0, 0); bl.rotation.z = k * 2.094; bl.position.set(Math.sin(k * 2.094) * -0.0, 0, 0); }
    // stern bench + cleats + engine well
    bx(g, 2.0, 0.08, 0.2, dark, 0, gTop(3.2) - 0.02, 3.2);

    // visible driver
    const drv = new THREE.Group(); drv.position.set(0, D, -0.3);
    const cloth = mat(0x3b4a5a, { roughness: 0.9, metalness: 0 });
    bx(drv, 0.44, 0.58, 0.26, cloth, 0, 0.95, 0.05, 0.1, 0, 0);
    const head = new THREE.Mesh(geo.head, mat(0xd9a77f, { roughness: 0.8, metalness: 0 })); head.position.set(0, 1.4, 0.03); drv.add(head);
    const cap = new THREE.Mesh(geo.helm, mat(0xf0f0f0, { roughness: 0.6 })); cap.position.set(0, 1.43, 0.03); drv.add(cap);
    bar(drv, cloth, -0.22, 1.1, 0.0, -0.14, 0.9, -0.68, 0.09);
    bar(drv, cloth, 0.22, 1.1, 0.0, 0.14, 0.9, -0.68, 0.09);
    g.add(drv);

    g.userData.steerWheel = spin;
    g.userData.motor = motor;
    g.userData.prop = prop;
    g.userData.driverDummy = drv;
    g.userData.eye = new THREE.Vector3(0, D + 1.7, -0.2);
    finishShadows(g);
    return g;
  }

  // wake (flat foam trail) + shared spray particles
  const spray = { pts: null, pos: null, vel: null, life: null, n: 150, head: 0 };
  function makeWake(v) {
    const m = new THREE.Mesh(geo.wakePlane, new THREE.MeshBasicMaterial({ map: wakeTex(), transparent: true, opacity: 0,
      depthWrite: false, fog: true }));
    m.rotation.x = -Math.PI / 2; m.rotation.order = 'YXZ';
    m.renderOrder = 2; m.frustumCulled = false; m.visible = false;
    root.add(m);
    v.wake = m;
  }
  function updateWake(v, dt) {
    const w = v.wake;
    if (!w) return;
    const sp = Math.abs(v.speed);
    if (sp < 1 || v.destroyed) { w.visible = false; return; }
    const k = Math.min(1, sp / 16);
    const len = 4 + 12 * k, wid = 5 + 4 * k;
    w.visible = true;
    w.material.opacity = 0.25 + 0.55 * k;
    w.scale.set(wid, len, 1);
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const back = 3.1 + len / 2;       // top edge of the trail sits at the stern
    w.position.set(v.pos.x + s * back, 0.12, v.pos.z + c * back);
    w.rotation.set(-Math.PI / 2, v.yaw, 0, 'YXZ');
  }
  function emitSpray(v, dt) {
    if (!spray.pts || v.type !== 'boat' || v.destroyed) return;
    const sp = Math.abs(v.speed);
    if (sp < 5) return;
    v._sprayAcc = (v._sprayAcc || 0) + (sp - 4) * 4 * dt;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    while (v._sprayAcc >= 1) {
      v._sprayAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const lz = -2.3 + Math.random() * 0.8, lx = side * (0.5 + Math.random() * 0.4);
      const i = spray.head; spray.head = (spray.head + 1) % spray.n;
      spray.pos[i * 3] = v.pos.x + lx * c + lz * s;
      spray.pos[i * 3 + 1] = 0.2;
      spray.pos[i * 3 + 2] = v.pos.z - lx * s + lz * c;
      const out = side * (1.5 + Math.random() * 1.5);
      spray.vel[i * 3] = out * c - (-sp * 0.25) * s * 0.3 + 0;
      spray.vel[i * 3 + 1] = 2 + Math.random() * 2.5;
      spray.vel[i * 3 + 2] = -out * s + (-sp * 0.25) * c * 0.3;
      spray.life[i] = 0.5 + Math.random() * 0.5;
    }
  }
  function updateSpray(dt) {
    if (!spray.pts) return;
    let any = false;
    for (let i = 0; i < spray.n; i++) {
      if (spray.life[i] > 0) {
        spray.life[i] -= dt;
        spray.vel[i * 3 + 1] -= 9 * dt;
        spray.pos[i * 3] += spray.vel[i * 3] * dt;
        spray.pos[i * 3 + 1] += spray.vel[i * 3 + 1] * dt;
        spray.pos[i * 3 + 2] += spray.vel[i * 3 + 2] * dt;
        if (spray.life[i] <= 0 || spray.pos[i * 3 + 1] < 0) { spray.life[i] = 0; spray.pos[i * 3 + 1] = -1000; }
        any = true;
      }
    }
    if (any || spray._dirty) { spray.pts.geometry.attributes.position.needsUpdate = true; spray._dirty = any; }
  }

  // ---------- helpers ----------
  function seatWorld(v, idx, out) {
    const t = TYPES[v.type], s = t.seats[idx];
    const c = Math.cos(v.yaw), sn = Math.sin(v.yaw);
    out.set(v.pos.x + s[0] * c + s[1] * sn, v.pos.y + t.seatY, v.pos.z - s[0] * sn + s[1] * c);
    return out;
  }
  function wrapPi(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function syncOcc(v) {
    v.driver = v.occ[0] || null;
    v.passengers.length = 0;
    for (let i = 1; i < v.occ.length; i++) if (v.occ[i]) v.passengers.push(v.occ[i]);
  }
  function hasFreeSeat(v) {
    for (let i = 0; i < v.occ.length; i++) if (!v.occ[i]) return true;
    return false;
  }
  function nearestWater(x, z, maxR) {
    const W = COD.world;
    if (W.isWater(x, z)) return null;
    for (let r = 6; r <= maxR; r += 6) {
      for (let a = 0; a < 12; a++) {
        const px = x + Math.cos(a * Math.PI / 6) * r, pz = z + Math.sin(a * Math.PI / 6) * r;
        if (W.isWater(px, pz)) return [px, pz];
      }
    }
    return null;
  }

  // ---------- spawn / enter / exit ----------
  function spawn(type, pos, yaw) {
    const def = TYPES[type];
    if (!def) return null;
    let px = pos.x, pz = pos.z;
    if (type === 'boat' && COD.world && !COD.world.isWater(px, pz)) {
      const w = nearestWater(px, pz, 150);
      if (w) { px = w[0]; pz = w[1]; }
    }
    const v = { id: nextId++, type: type, pos: new THREE.Vector3(px, 0, pz), yaw: yaw || 0, speed: 0,
      hp: def.hp, maxHp: def.hp, mesh: null, driver: null, passengers: [], seats: def.seats.length,
      occ: [], control: { throttle: 0, steer: 0 }, auto: null, destroyed: false, enterTime: -9,
      home: null, pitch: 0, hitCd: {}, it: null, wreck: null, blocked: false, steerVis: 0, wake: null };
    for (let i = 0; i < def.seats.length; i++) v.occ.push(null);
    v.pos.y = type === 'boat' ? 0 : (COD.world ? COD.world.heightAt(px, pz) : pos.y);
    v.mesh = type === 'car' ? buildCar() : buildBoat();
    v.mesh.rotation.order = 'YXZ';
    v.mesh.position.copy(v.pos); v.mesh.rotation.y = v.yaw;
    root.add(v.mesh);
    if (type === 'boat') makeWake(v);
    v.it = COD.interact.add({ pos: v.pos, radius: type === 'boat' ? 4.0 : 3.2, enabled: true,
      prompt: function (actor) {
        if (actor && actor.vehicle === v) return 'Exit ' + v.type;
        return (v.driver ? 'Ride in ' : 'Drive ') + v.type;
      },
      onUse: function (actor) {
        if (actor.vehicle === v) { if (COD.state.time - v.enterTime > 0.3) exit(actor); }
        else if (!actor.vehicle) enter(actor, v);
      } });
    list.push(v);
    return v;
  }

  function seatActor(v, actor, idx) {
    v.occ[idx] = actor;
    actor.vehicle = v;
    actor.hidden = null;
    actor.crouching = false; actor.sprinting = false;
    actor.vel.set(0, 0, 0);
    v.enterTime = COD.state.time;
    syncOcc(v);
    seatWorld(v, idx, actor.pos);
    if (actor.kind === 'player') { actor.yaw = v.yaw; actor.pitch = -0.32; cam.v = null; }
  }

  function enter(actor, v) {
    if (!actor || !v || v.destroyed || v.auto || actor.vehicle || !actor.alive) return false;
    let idx = -1;
    for (let i = 0; i < v.occ.length; i++) if (!v.occ[i]) { idx = i; break; }
    if (idx < 0) return false;
    seatActor(v, actor, idx);
    COD.sfx('engine', v.pos);
    return true;
  }

  function removeOcc(v, actor) {
    for (let i = 0; i < v.occ.length; i++) if (v.occ[i] === actor) v.occ[i] = null;
    actor.vehicle = null;
    syncOcc(v);
    if (actor === COD.player) restoreView();
  }

  function findExit(v, actor) {
    const W = COD.world, c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    const r = TYPES[v.type].radius + 1.2;
    const idx = Math.max(0, v.occ.indexOf(actor));
    const side = (idx % 2 === 0) ? -1 : 1;
    const cands = [[side * r, 0], [-side * r, 0], [0, r + 1.5], [0, -(r + 1.5)], [side * (r + 3), 0], [-side * (r + 3), 0]];
    let fallback = null;
    for (let i = 0; i < cands.length; i++) {
      const x = v.pos.x + cands[i][0] * c + cands[i][1] * s, z = v.pos.z - cands[i][0] * s + cands[i][1] * c;
      const water = W.isWater(x, z);
      if (!water) return [x, z];
      if (!fallback && v.type === 'boat') fallback = [x, z];
    }
    return fallback || [v.pos.x, v.pos.z];
  }

  function exit(actor, force) {
    const v = actor && actor.vehicle;
    if (!v) return false;
    if (v.auto && !force) return false;
    const p = findExit(v, actor);
    removeOcc(v, actor);
    const gy = COD.world.heightAt(p[0], p[1]);
    actor.pos.set(p[0], Math.max(gy, 0), p[1]);
    actor.vel.set(0, 0, 0);
    actor.onGround = true;
    return true;
  }

  function dropAll(v, spreadAround) {
    const W = COD.world;
    const ppl = v.occ.filter(Boolean);
    for (let i = 0; i < ppl.length; i++) {
      const a = ppl[i];
      removeOcc(v, a);
      const ang = (i / Math.max(1, ppl.length)) * Math.PI * 2, rad = 1.2 + (i % 2) * 1.2;
      const x = spreadAround.x + Math.cos(ang) * rad, z = spreadAround.z + Math.sin(ang) * rad;
      a.pos.set(x, Math.max(W.heightAt(x, z), 0), z);
      a.vel.set(0, 0, 0);
      a.onGround = true;
    }
  }

  // ---------- damage ----------
  function damage(v, amount, attacker) {
    if (!v || v.destroyed || amount <= 0) return;
    v.hp -= amount;
    if (v.hp <= 0) destroy(v, attacker);
  }

  function destroy(v, attacker) {
    v.destroyed = true;
    v.hp = 0;
    v.it.enabled = false;
    // eject occupants first
    const ppl = v.occ.filter(Boolean);
    for (let i = 0; i < ppl.length; i++) exit(ppl[i], true);
    v.driver = null;
    v.speed = 0;
    v.mesh.visible = false;
    if (v.wake) v.wake.visible = false;
    if (!v.wreck) {
      v.wreck = new THREE.Mesh(v.type === 'car' ? geo.carWreck : geo.boatWreck, mat(0x151515, { roughness: 1, metalness: 0 }));
      v.wreck.castShadow = gfxHigh();
      root.add(v.wreck);
    }
    v.wreck.visible = true;
    v.wreck.position.set(v.pos.x, v.pos.y + (v.type === 'car' ? 0.5 : 0), v.pos.z);
    v.wreck.rotation.y = v.yaw;
    if (COD.projectiles && COD.projectiles.explode) {
      COD.projectiles.explode(v.pos.clone().setY(v.pos.y + 0.8), 7, 90, attacker || null, 'vehicle');
    } else COD.sfx('explosion', v.pos);
  }

  function respawnAll() {
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (!v.destroyed || !v.home) continue;
      v.destroyed = false; v.hp = v.maxHp; v.speed = 0;
      v.pos.copy(v.home.pos); v.yaw = v.home.yaw;
      if (v.wreck) v.wreck.visible = false;
      v.mesh.visible = true; v.it.enabled = true;
    }
  }

  // ---------- boat landing ----------
  function startBoatLanding(team, actors, from, to) {
    const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
    const v = spawn('boat', from, yaw);
    if (!v) return null;
    v.pos.set(from.x, 0, from.z); v.yaw = yaw;
    v.team = team;
    v.auto = { target: to.clone(), startTime: COD.state.time, from: from.clone() };
    for (let i = 0; i < actors.length && i < v.occ.length; i++) seatActor(v, actors[i], i);
    for (let j = v.occ.length; j < actors.length; j++) {   // more than 6: drop on beach right away
      actors[j].pos.set(to.x, COD.world.heightAt(to.x, to.z), to.z);
    }
    v.mesh.position.copy(v.pos); v.mesh.rotation.y = v.yaw;
    return v;
  }

  function finishLanding(v) {
    const to = v.auto.target;
    v.auto = null;
    v.speed = 0;
    dropAll(v, to);
    v.control.throttle = 0; v.control.steer = 0;
    COD.sfx('engine', v.pos);
  }

  // ---------- physics ----------
  function drive(v, dt) {
    const t = TYPES[v.type], c = v.control, W = COD.world;
    let maxF = t.maxF;
    if (v.auto) {
      // steer toward target
      const dx = v.auto.target.x - v.pos.x, dz = v.auto.target.z - v.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const diff = wrapPi(Math.atan2(-dx, -dz) - v.yaw);
      c.steer = COD.clamp(diff * 2, -1, 1);
      c.throttle = 1;
      maxF = Math.min(14, 4 + dist * 0.35);
      if (dist < 5 || (v.blocked && dist < 45) || COD.state.time - v.auto.startTime > 45) { finishLanding(v); return; }
    } else if (v.driver === COD.player && COD.player && !COD.state.uiMode) {
      const K = COD.input ? COD.input.keys : {};
      c.throttle = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0);
      c.steer = (K.KeyA ? 1 : 0) - (K.KeyD ? 1 : 0);
      if (K.Space) v.speed *= Math.max(0, 1 - 4 * dt);
    } else if (!v.driver) { c.throttle = 0; c.steer = 0; }
    else if (v.driver === COD.player) { c.throttle = 0; c.steer = 0; }
    c.throttle = COD.clamp(c.throttle || 0, -1, 1);
    c.steer = COD.clamp(c.steer || 0, -1, 1);

    // speed
    if (c.throttle > 0) v.speed += (v.speed < 0 ? t.accel * 2 : t.accel) * c.throttle * dt;
    else if (c.throttle < 0) v.speed += (v.speed > 0 ? t.accel * 2 : t.accel * 0.6) * c.throttle * dt;
    else {
      const drag = v.type === 'boat' ? 0.5 : 0.9;
      v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), (drag * Math.abs(v.speed) + 1.5) * dt);
    }
    v.speed = COD.clamp(v.speed, -t.maxR, maxF);

    // steering
    const sf = v.type === 'car' ? COD.clamp(v.speed / 6, -1, 1) : (Math.sign(v.speed || 1) * COD.clamp(Math.abs(v.speed) / 3, 0.25, 1));
    v.yaw += c.steer * t.turn * sf * dt;

    // movement
    if (Math.abs(v.speed) < 0.02) { v.speed = 0; v.blocked = false; return; }
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const dir = Math.sign(v.speed);
    const mx = fx * v.speed * dt, mz = fz * v.speed * dt;
    v.blocked = false;
    if (v.type === 'car') {
      const px = v.pos.x + mx + fx * dir * 1.8, pz = v.pos.z + mz + fz * dir * 1.8;
      if (W.isWater(px, pz)) { v.speed = 0; v.blocked = true; return; }
      _v1.set(mx, 0, mz);
      const px0 = v.pos.x, pz0 = v.pos.z;
      const res = W.resolveMove(v.pos, _v1, t.radius, 1.5);
      if (res && res.blocked) {
        v.blocked = true;
        const moved = Math.hypot(v.pos.x - px0, v.pos.z - pz0);
        const expected = Math.hypot(mx, mz);
        if (moved < expected * 0.5) {
          if (Math.abs(v.speed) > 10) damage(v, Math.abs(v.speed) * 1.5, null);
          v.speed *= 0.3;
        }
      }
      if (W.isWater(v.pos.x, v.pos.z)) { v.pos.x = px0; v.pos.z = pz0; v.speed = 0; }
      runOver(v);
    } else {
      const px = v.pos.x + mx + fx * dir * 2.6, pz = v.pos.z + mz + fz * dir * 2.6;
      let stop = !W.isWater(px, pz) || !W.isWater(v.pos.x + mx, v.pos.z + mz);
      if (!stop && !v.auto && Math.abs(v.speed) > 1) {
        _v1.set(v.pos.x, 0.7, v.pos.z); _v2.set(fx * dir, 0, fz * dir);
        const hit = W.raycast(_v1, _v2, 3.2);
        if (hit && hit.collider) stop = true;
      }
      if (stop) { v.speed = 0; v.blocked = true; }
      else { v.pos.x += mx; v.pos.z += mz; }
    }
  }

  function runOver(v) {
    if (Math.abs(v.speed) < 6 || !v.driver) return;
    const now = COD.state.time;
    const actors = COD.actors;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (!a.alive || a.vehicle || a.kind === 'drone' || a === v.driver) continue;
      if (Math.abs(a.pos.y - v.pos.y) > 2.2) continue;
      const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z;
      if (dx * dx + dz * dz > 2.6 * 2.6) continue;
      if (v.hitCd[a.id] && now - v.hitCd[a.id] < 0.6) continue;
      v.hitCd[a.id] = now;
      COD.combat.damage(a, Math.min(150, Math.abs(v.speed) * 5), { attacker: v.driver, weaponId: 'vehicle', headshot: false, point: a.pos });
    }
  }

  function visuals(v, dt) {
    const W = COD.world, t = COD.state.time, ud = v.mesh.userData;
    v.steerVis += ((v.control.steer || 0) - v.steerVis) * Math.min(1, dt * 9);
    if (v.type === 'car') {
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
      const hf = W.heightAt(v.pos.x + fx * 2, v.pos.z + fz * 2), hb = W.heightAt(v.pos.x - fx * 2, v.pos.z - fz * 2);
      const target = Math.atan2(hf - hb, 4);
      v.pitch += (target - v.pitch) * Math.min(1, dt * 8);
      // body roll when cornering + slight dive/squat
      const lean = -v.steerVis * Math.min(1, Math.abs(v.speed) / 20) * 0.05;
      v.mesh.rotation.set(v.pitch, v.yaw, lean);
      const spin = v.speed * dt / 0.38;
      for (let i = 0; i < ud.spins.length; i++) ud.spins[i].rotation.x -= spin;
      for (let j = 0; j < ud.steerHolders.length; j++) ud.steerHolders[j].rotation.y = v.steerVis * 0.5;
      ud.steerWheel.rotation.z = -v.steerVis * 1.6;
      const braking = (v.control.throttle < 0 && v.speed > 0.5) || (v.control.throttle > 0 && v.speed < -0.5) ||
        (v.driver === COD.player && COD.input && COD.input.keys && COD.input.keys.Space && Math.abs(v.speed) > 0.5);
      const tm = braking ? matTailOn() : matTailOff();
      if (ud.tails[0].material !== tm) { ud.tails[0].material = tm; ud.tails[1].material = tm; }
    } else {
      v.pos.y = Math.sin(t * 1.5 + v.id) * 0.07;
      const lean = -(v.control.steer || 0) * Math.min(1, Math.abs(v.speed) / 10) * 0.12;
      v.mesh.rotation.set(-Math.min(0.12, Math.abs(v.speed) * 0.006) + Math.sin(t * 1.1 + v.id) * 0.015, v.yaw, lean + Math.sin(t * 1.3 + v.id) * 0.02);
      ud.steerWheel.rotation.z = -v.steerVis * 1.8;
      ud.motor.rotation.y = v.steerVis * 0.45;
      ud.prop.rotation.z += Math.abs(v.speed) * dt * 3 + dt * (v.driver ? 6 : 0);
      updateWake(v, dt);
      emitSpray(v, dt);
    }
    v.mesh.position.copy(v.pos);
  }

  // ---------- vehicle camera (owns COD.camera while the player rides) ----------
  const cam = { v: null, mode: 'chase', prevYaw: 0, tx: 0, ty: 0, tz: 0, dist: 7, lookYaw: 0, ready: false };

  function restoreView() {
    const P = COD.player;
    if (!P || !cam.v) { cam.v = null; return; }
    P.yaw = cam.lookYaw;
    P.pitch = 0;
    cam.v = null;
    if (COD.hud && COD.hud.setPrompt) COD.hud.setPrompt(null);
  }

  function updateCamera(dt) {
    const P = COD.player;
    if (!P || !P.vehicle || P.vehicle.destroyed || !P.alive || !COD.camera) { if (cam.v && !(P && P.vehicle)) cam.v = null; return; }
    const v = P.vehicle, W = COD.world, camera = COD.camera;
    const boat = v.type === 'boat';
    if (cam.v !== v) {
      cam.v = v; cam.mode = 'chase'; cam.prevYaw = v.yaw; cam.ready = false;
      cam.dist = boat ? 9.5 : 6.8;
      P.yaw = v.yaw; P.pitch = -0.32;
    }
    if (!COD.state.uiMode && COD.input && COD.input.pressed('KeyV')) cam.mode = cam.mode === 'chase' ? 'cockpit' : 'chase';
    // the view turns with the vehicle
    P.yaw += wrapPi(v.yaw - cam.prevYaw);
    cam.prevYaw = v.yaw;
    if (P.yaw > Math.PI) P.yaw -= Math.PI * 2; else if (P.yaw < -Math.PI) P.yaw += Math.PI * 2;

    const dd = v.mesh.userData.driverDummy;
    if (dd) dd.visible = (v.driver === P) && cam.mode === 'chase';

    if (cam.mode === 'cockpit') {
      P.pitch = COD.clamp(P.pitch, -1.2, 1.0);
      v.mesh.updateMatrixWorld(true);
      _v1.copy(v.mesh.userData.eye);
      v.mesh.localToWorld(_v1);
      camera.position.copy(_v1);
      const roll = boat ? v.mesh.rotation.z * 0.5 : v.mesh.rotation.z * 0.8;
      camera.rotation.set(COD.clamp(P.pitch + 0.18, -1.3, 1.2) + v.mesh.rotation.x * 0.7, P.yaw, roll, 'YXZ');
      cam.lookYaw = P.yaw;
      cam.ready = false;
      return;
    }

    // chase camera: orbit around a smoothed target point on the vehicle
    P.pitch = COD.clamp(P.pitch, -0.95, 0.12);
    const baseY = boat ? 0 : v.pos.y;
    const ox = v.pos.x, oy = baseY + (boat ? 1.5 : 1.3), oz = v.pos.z;
    if (!cam.ready) { cam.tx = ox; cam.ty = oy; cam.tz = oz; cam.ready = true; }
    else {
      const kx = 1 - Math.exp(-dt * 14), ky = 1 - Math.exp(-dt * 5);
      cam.tx += (ox - cam.tx) * kx; cam.tz += (oz - cam.tz) * kx; cam.ty += (oy - cam.ty) * ky;
    }
    const e = -P.pitch, ce = Math.cos(e), se = Math.sin(e);
    _v2.set(Math.sin(P.yaw) * ce, se, Math.cos(P.yaw) * ce);   // from target toward camera
    _v3.set(cam.tx, cam.ty, cam.tz);
    let want = boat ? 9.5 : 6.8;
    if (W && W.raycast) {
      const hit = W.raycast(_v3, _v2, want + 0.6, true);
      if (hit && hit.dist < want + 0.6) want = Math.max(1.6, hit.dist - 0.5);
    }
    if (want < cam.dist) cam.dist = want; else cam.dist += (want - cam.dist) * (1 - Math.exp(-dt * 4));
    let cx = cam.tx + _v2.x * cam.dist, cy = cam.ty + _v2.y * cam.dist, cz = cam.tz + _v2.z * cam.dist;
    const gy = W && W.groundAt ? W.groundAt(cx, cz) : 0;
    const minY = Math.max(gy + 0.5, boat ? 0.45 : 0.5);
    if (cy < minY) cy = minY;
    camera.position.set(cx, cy, cz);
    // aim at the target so the vehicle stays framed even after clamping
    const lx = cam.tx - cx, ly = cam.ty - cy, lz = cam.tz - cz;
    const yawL = Math.atan2(-lx, -lz), pitL = Math.atan2(ly, Math.hypot(lx, lz));
    camera.rotation.set(pitL, yawL, 0, 'YXZ');
    cam.lookYaw = yawL;
  }

  // ---------- module ----------
  function init() {
    geo.tyre = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16);
    geo.rim = new THREE.CylinderGeometry(0.24, 0.24, 0.3, 12);
    geo.plate = new THREE.PlaneGeometry(0.5, 0.125);
    geo.steerRing = new THREE.TorusGeometry(0.17, 0.025, 6, 16);
    geo.head = new THREE.SphereGeometry(0.12, 10, 8);
    geo.helm = new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    geo.carWreck = new THREE.BoxGeometry(2.0, 1.0, 4.2);
    geo.boatWreck = new THREE.BoxGeometry(2.2, 0.5, 6.0);
    geo.wakePlane = new THREE.PlaneGeometry(1, 1);
    root = new THREE.Group();
    root.name = 'vehicles-root';
    COD.scene.add(root);
    // spray particle pool
    spray.pos = new Float32Array(spray.n * 3); spray.vel = new Float32Array(spray.n * 3); spray.life = new Float32Array(spray.n);
    for (let i = 0; i < spray.n; i++) spray.pos[i * 3 + 1] = -1000;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(spray.pos, 3));
    spray.pts = new THREE.Points(sg, new THREE.PointsMaterial({ map: softTex(), size: 0.7, sizeAttenuation: true, transparent: true,
      opacity: 0.75, depthWrite: false, color: 0xffffff }));
    spray.pts.frustumCulled = false;
    root.add(spray.pts);

    const vs = (COD.world && COD.world.vehicleSpots) || [];
    vs.forEach(function (s) {
      const v = spawn(s.type, s.pos, s.yaw);
      if (v) v.home = { pos: v.pos.clone(), yaw: v.yaw };
      spots.push(s);
    });
    COD.on('phase', respawnAll);
    COD.on('kill', function (d) {
      const a = d.victim;
      if (a && a.vehicle) { const v = a.vehicle; if (v.auto) { removeOcc(v, a); } else exit(a, true); }
    });
    COD.on('spawn', function (d) {
      const a = d.actor;
      if (a && a.vehicle && !a.vehicle.auto) removeOcc(a.vehicle, a);
    });
  }

  function update(dt) {
    const now = COD.state.time;
    engineTimer -= dt;
    const player = COD.player;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.destroyed) continue;
      if (v.driver || v.auto || v.speed !== 0) drive(v, dt);
      else { v.control.throttle = 0; v.control.steer = 0; }
      // occupants follow seats
      for (let s = 0; s < v.occ.length; s++) {
        const a = v.occ[s];
        if (!a) continue;
        if (!a.alive) { removeOcc(v, a); continue; }
        seatWorld(v, s, a.pos);
        a.vel.set(0, 0, 0);
        a.onGround = true;
        if (a.kind !== 'player') a.yaw = v.yaw;
      }
      visuals(v, dt);
      v.it.enabled = !v.auto && (hasFreeSeat(v) || (player && player.vehicle === v));
      // engine sound for the player's vehicle
      if (player && player.vehicle === v && engineTimer <= 0 && Math.abs(v.speed) > 1.5) {
        COD.sfx('engine', v.pos); engineTimer = 0.7;
      }
    }
    updateSpray(dt);
    // player exit with E
    if (player && player.vehicle && !player.vehicle.auto && !COD.state.uiMode && COD.input && COD.input.pressed('KeyE')) {
      if (now - player.vehicle.enterTime > 0.3) exit(player);
    }
    // camera is set last, after the seat and mesh have moved this frame
    if (player && player.vehicle) {
      updateCamera(dt);
      if (player.vehicle && !player.vehicle.auto && COD.hud && COD.hud.setPrompt) COD.hud.setPrompt('[E] Exit ' + player.vehicle.type + '   [V] Change view');
    }
  }

  COD.vehicles = {
    init: init, update: update, list: list,
    spawn: spawn, enter: enter, exit: exit, damage: damage,
    startBoatLanding: startBoatLanding, respawnAll: respawnAll,
  };
})();
