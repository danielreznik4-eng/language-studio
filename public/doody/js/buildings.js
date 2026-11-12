/* Call of Doody - buildings.js (Chat 3)
   Bank, museum (pirate section), houses, shops, warehouse, plaza + clock tower,
   dock, roads, props, breakable windows, hiding spots, loot/vehicle/station spots. */
(function () {
  'use strict';
  const COD = window.COD;
  const B = {};
  COD.buildings = B;

  let W = null, PL = 2, batch = null, root = null, scene = null;
  const windows = [];
  const FOOT = [];   // building footprints [x0,z0,x1,z1] (used to keep grass out)
  const shards = [];
  let shardIdx = 0;
  let planeGeo = null, boxGeo = null, hoopGeo = null;

  // ----------------------------------------------------------------- basic helpers
  function box(mat, x0, z0, x1, z1, y0, y1, col, tag) {
    batch.box(mat, x0, PL + y0, z0, x1, PL + y1, z1);
    if (col) return W.box(x0, PL + y0, z0, x1, PL + y1, z1, col, tag);
    return null;
  }
  function invis(x0, z0, x1, z1, y0, y1, col, tag) {
    return W.box(x0, PL + y0, z0, x1, PL + y1, z1, col || 'solid', tag);
  }
  function V3(x, y, z) { return new THREE.Vector3(x, y, z); }
  function cover(x, z) { W.coverPoints.push(V3(x, W.groundAt(x, z), z)); }
  function yawOf(dx, dz) { return Math.atan2(-dx, -dz); }

  /** Local frame: f = front (unit axis vector), r = lateral. */
  function Frame(cx, cz, fx, fz) {
    this.cx = cx; this.cz = cz; this.fx = fx; this.fz = fz; this.rx = -fz; this.rz = fx;
  }
  Frame.prototype.x = function (u, v) { return this.cx + this.rx * u + this.fx * v; };
  Frame.prototype.z = function (u, v) { return this.cz + this.rz * u + this.fz * v; };
  Frame.prototype.box = function (mat, u0, u1, v0, v1, y0, y1, col, tag) {
    const xa = this.x(u0, v0), xb = this.x(u1, v1), za = this.z(u0, v0), zb = this.z(u1, v1);
    return box(mat, Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb), y0, y1, col, tag);
  };
  Frame.prototype.pos = function (u, v, y) { return V3(this.x(u, v), PL + (y || 0), this.z(u, v)); };

  // ----------------------------------------------------------------- glass + shards
  function initShards() {
    const g = new THREE.BoxGeometry(0.12, 0.12, 0.02);
    const m = new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Mesh(g, m);
      s.visible = false;
      s.userData = { vx: 0, vy: 0, vz: 0, life: 0 };
      root.add(s);
      shards.push(s);
    }
  }
  function spawnShards(win) {
    for (let k = 0; k < 12; k++) {
      const s = shards[shardIdx++ % shards.length];
      const u = s.userData;
      s.position.set(
        win.cx + (Math.random() - 0.5) * win.sx, win.cy + (Math.random() - 0.5) * win.sy,
        win.cz + (Math.random() - 0.5) * win.sz);
      u.vx = (Math.random() - 0.5) * 3; u.vy = Math.random() * 2.5; u.vz = (Math.random() - 0.5) * 3;
      u.life = 1.2 + Math.random() * 0.8;
      s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      s.visible = true;
    }
  }
  function breakWindow(win) {
    if (win.broken) return;
    win.broken = true;
    win.mesh.visible = false;
    win.collider.enabled = false;
    spawnShards(win);
    const p = V3(win.cx, win.cy, win.cz);
    if (COD.sfx) COD.sfx('glass', p);
    if (COD.emit) COD.emit('windowBreak', { pos: p });
  }
  B.breakWindow = breakWindow;
  B.windows = windows;

  /** breakable glass block (absolute y). */
  function glassBlock(x0, y0, z0, x1, y1, z1) {
    const m = new THREE.Mesh(boxGeo, W.mats.glass);
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    m.scale.set(sx, sy, sz);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    root.add(m);
    const col = W.box(x0, y0, z0, x1, y1, z1, 'window', 'glass');
    const win = { mesh: m, collider: col, broken: false, cx: m.position.x, cy: m.position.y, cz: m.position.z, sx: sx, sy: sy, sz: sz };
    col.onHit = function () { breakWindow(win); };
    windows.push(win);
    return win;
  }

  // ----------------------------------------------------------------- walls
  function frameBox(alongX, c, s0, s1, y0, y1, half, mat) {
    if (alongX) batch.box(mat || 'frame', s0, PL + y0, c - half, s1, PL + y1, c + half);
    else batch.box(mat || 'frame', c - half, PL + y0, s0, c + half, PL + y1, s1);
  }
  function cornice(x0, z0, x1, z1, y, hgt, mat) {
    const t = 0.35;
    batch.box(mat, x0 - t, PL + y, z0 - t, x1 + t, PL + y + hgt, z0);
    batch.box(mat, x0 - t, PL + y, z1, x1 + t, PL + y + hgt, z1 + t);
    batch.box(mat, x0 - t, PL + y, z0, x0, PL + y + hgt, z1);
    batch.box(mat, x1, PL + y, z0, x1 + t, PL + y + hgt, z1);
    batch.box(mat, x0 - t - 0.12, PL + y + hgt, z0 - t - 0.12, x1 + t + 0.12, PL + y + hgt + 0.12, z1 + t + 0.12);
  }
  /** Axis-aligned wall from (x0,z0) to (x1,z1). ops: [{a, w, type:'door'|'arch'|'win', sill, top}] (a = distance from start). */
  function wall(mat, x0, z0, x1, z1, h, th, ops) {
    const alongX = (z0 === z1);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const c = alongX ? z0 : x0, t2 = th / 2;
    function seg(s, e, y0, y1, col, m) {
      if (e - s < 0.01) return;
      if (alongX) box(m || mat, s, c - t2, e, c + t2, y0, y1, col || 'solid');
      else box(m || mat, c - t2, s, c + t2, e, y0, y1, col || 'solid');
    }
    ops = (ops || []).slice().sort(function (p, q) { return p.a - q.a; });
    let cur = a0 - t2;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i], s = a0 + op.a, e = s + op.w, type = op.type || 'door';
      seg(cur, s, 0, h);
      if (type === 'door' || type === 'arch') {
        seg(s, e, op.top || 2.8, h);
        const dt = op.top || 2.8, hf = t2 + 0.07;
        frameBox(alongX, c, s, s + 0.12, 0, dt, hf, 'darkframe'); frameBox(alongX, c, e - 0.12, e, 0, dt, hf, 'darkframe');
        frameBox(alongX, c, s - 0.1, e + 0.1, dt - 0.12, dt + 0.15, hf + 0.03, 'darkframe');
      } else {
        const sill = op.sill === undefined ? 0.9 : op.sill, top = op.top === undefined ? 2.4 : op.top;
        seg(s, e, 0, sill, 'low');
        seg(s, e, top, h);
        const gy0 = PL + sill, gy1 = PL + top, t = 0.07;
        if (alongX) glassBlock(s, gy0, c - t, e, gy1, c + t); else glassBlock(c - t, gy0, s, c + t, gy1, e);
        // frame, sill ledge and mullions (visual only)
        const hf = t2 + 0.06, mid = (s + e) / 2, ym = (sill + top) / 2;
        frameBox(alongX, c, s, s + 0.1, sill, top, hf); frameBox(alongX, c, e - 0.1, e, sill, top, hf);
        frameBox(alongX, c, s - 0.08, e + 0.08, top, top + 0.12, t2 + 0.09);
        frameBox(alongX, c, s - 0.1, e + 0.1, sill - 0.06, sill + 0.04, t2 + 0.13);
        frameBox(alongX, c, mid - 0.03, mid + 0.03, sill, top, 0.04);
        frameBox(alongX, c, s, e, ym - 0.03, ym + 0.03, 0.04);
      }
      cur = e;
    }
    seg(cur, a1 + t2, 0, h);
  }

  function houseOps(L, doorWall, big) {
    if (doorWall) {
      if (big) return [{ a: 1.2, w: 2.2, type: 'win' }, { a: L / 2 - 2, w: 4, type: 'door', top: 3.4 }, { a: L - 3.4, w: 2.2, type: 'win' }];
      return [{ a: 1, w: 2, type: 'win' }, { a: L / 2 - 1.2, w: 2.4, type: 'door' }, { a: L - 3, w: 2, type: 'win' }];
    }
    return [{ a: L / 2 - 1, w: 2, type: 'win' }];
  }

  /** gable roof (visual only) above a rectangle, ridge along the longer side. */
  function gable(x0, z0, x1, z1, y, rise, wallMat) {
    const ov = 0.45, ridgeX = (x1 - x0) >= (z1 - z0);
    const u0 = (ridgeX ? x0 : z0) - ov, u1 = (ridgeX ? x1 : z1) + ov;
    const v0 = (ridgeX ? z0 : z0 * 0 + x0) - ov, v1 = (ridgeX ? z1 : x1) + ov;
    const vR = (v0 + v1) / 2, ye = PL + y, yr = PL + y + rise;
    function P(u, yy, v) { return ridgeX ? [u, yy, v] : [v, yy, u]; }
    function Q(a, b, c, d) { if (ridgeX) batch.quad('roof', a, b, c, d); else batch.quad('roof', a, d, c, b); }
    function T(a, b, c) { if (ridgeX) batch.tri(wallMat, a, b, c); else batch.tri(wallMat, a, c, b); }
    Q(P(u0, ye, v1), P(u1, ye, v1), P(u1, yr, vR), P(u0, yr, vR));
    Q(P(u1, ye, v0), P(u0, ye, v0), P(u0, yr, vR), P(u1, yr, vR));
    const iu0 = u0 + ov, iu1 = u1 - ov, iv0 = v0 + ov, iv1 = v1 - ov;
    T(P(iu0, ye, iv0), P(iu0, ye, iv1), P(iu0, yr, vR));
    T(P(iu1, ye, iv1), P(iu1, ye, iv0), P(iu1, yr, vR));
  }

  // ----------------------------------------------------------------- hiding spots
  function setDoor(spot, closed) {
    spot.meshOpen.visible = !closed;
    spot.meshLo.visible = closed;
    spot.meshHi.visible = closed;
  }

  /** Closet / locker / crate you can hide in. fr = Frame at its centre, f = way the front faces. */
  function hidingSpot(kind, cx, cz, fx, fz, matName) {
    const fr = new Frame(cx, cz, fx, fz);
    const mat = matName || 'wood';
    const hgt = kind === 'crate' ? 2.3 : 2.2;
    fr.box(mat, -0.5, 0.5, -0.5, -0.43, 0, hgt, 'solid', 'hide');
    fr.box(mat, -0.5, -0.43, -0.5, 0.5, 0, hgt, 'solid', 'hide');
    fr.box(mat, 0.43, 0.5, -0.5, 0.5, 0, hgt, 'solid', 'hide');
    fr.box(mat, -0.5, 0.5, -0.5, 0.5, hgt - 0.1, hgt, 'solid', 'hide');
    invis(Math.min(fr.x(-0.5, 0.43), fr.x(0.5, 0.5)), Math.min(fr.z(-0.5, 0.43), fr.z(0.5, 0.5)),
      Math.max(fr.x(-0.5, 0.43), fr.x(0.5, 0.5)), Math.max(fr.z(-0.5, 0.43), fr.z(0.5, 0.5)), 0, hgt, 'solid', 'hide');
    const rotY = (fx !== 0) ? Math.PI / 2 : 0;
    const dm = W.mats[mat];
    // closed door pieces with an eye slit at head height
    const lo = new THREE.Mesh(boxGeo, dm); lo.scale.set(1.0, 1.55, 0.06);
    lo.position.set(fr.x(0, 0.47), PL + 0.775, fr.z(0, 0.47)); lo.rotation.y = rotY;
    const hi = new THREE.Mesh(boxGeo, dm); hi.scale.set(1.0, hgt - 1.78, 0.06);
    hi.position.set(fr.x(0, 0.47), PL + 1.78 + (hgt - 1.78) / 2, fr.z(0, 0.47)); hi.rotation.y = rotY;
    // open door: leaf swung outward on its hinge
    const pivot = new THREE.Group();
    pivot.position.set(fr.x(-0.5, 0.5), PL + 1.05, fr.z(-0.5, 0.5));
    const leaf = new THREE.Mesh(boxGeo, dm); leaf.scale.set(1.0, 2.0, 0.05); leaf.position.set(0.5, 0, 0);
    pivot.add(leaf); pivot.rotation.y = rotY + (fx !== 0 || fz !== 0 ? -1.9 : 0);
    root.add(lo, hi, pivot);
    const spot = {
      kind: kind,
      pos: fr.pos(0, 0, 0),
      viewPos: fr.pos(0, 0, 0),
      eyePos: fr.pos(0, 0, 1.7),
      yaw: yawOf(fx, fz),
      exitPos: fr.pos(0, 1.2, 0),
      occupant: null,
      meshLo: lo, meshHi: hi, meshOpen: pivot
    };
    setDoor(spot, false);
    W.hidingSpots.push(spot);
    const label = kind === 'locker' ? 'Hide in locker' : kind === 'crate' ? 'Hide in crate' : 'Hide in closet';
    if (COD.interact) {
      spot.interact = COD.interact.add({
        pos: fr.pos(0, 0.9, 1.0), radius: 1.7,
        prompt: function () { return spot.occupant ? 'Occupied' : label; },
        enabled: true,
        onUse: function (actor) { enterHiding(actor, spot); }
      });
    }
    cover(fr.x(0, 1.4), fr.z(0, 1.4));
    return spot;
  }

  function enterHiding(actor, spot) {
    if (!actor || spot.occupant) return;
    if (actor.hidden || actor.vehicle || actor.alive === false) return;
    actor.hidden = spot;
    spot.occupant = actor;
    actor.pos.copy(spot.viewPos);
    if (actor.vel) actor.vel.set(0, 0, 0);
    actor.yaw = spot.yaw; actor.pitch = 0;
    setDoor(spot, true);
  }
  B.enterHiding = enterHiding;
  B.leaveHiding = function (actor) {
    if (!actor || !actor.hidden) return;
    const spot = actor.hidden;
    actor.hidden = null;
    if (spot.occupant === actor) spot.occupant = null;
    actor.pos.copy(spot.exitPos);
    setDoor(spot, false);
  };

  // ----------------------------------------------------------------- spot registries
  function chest(type, x, z, yaw, y) {
    W.chestSpots.push({ pos: V3(x, y === undefined ? W.groundAt(x, z) : y, z), yaw: yaw, type: type });
  }
  function station(x, z, yaw) { W.stationSpots.push({ pos: V3(x, PL, z), yaw: yaw }); }
  function carSpot(x, z, yaw) { W.vehicleSpots.push({ type: 'car', pos: V3(x, PL, z), yaw: yaw }); }

  // ----------------------------------------------------------------- props
  function crate(x, z, s, mat) {
    const h = Math.min(s, 1.1);
    box(mat || 'crate', x - s / 2, z - s / 2, x + s / 2, z + s / 2, 0, h, 'low', 'crate');
    cover(x + s / 2 + 0.7, z); cover(x - s / 2 - 0.7, z);
  }
  function bigCrate(x, z, s) {
    box('crate', x - s / 2, z - s / 2, x + s / 2, z + s / 2, 0, s * 1.1, 'solid', 'crate');
    cover(x + s / 2 + 0.8, z);
  }
  function sandbags(x, z, len, alongX) {
    if (alongX) box('sandbag', x - len / 2, z - 0.45, x + len / 2, z + 0.45, 0, 1.05, 'low', 'sandbag');
    else box('sandbag', x - 0.45, z - len / 2, x + 0.45, z + len / 2, 0, 1.05, 'low', 'sandbag');
    if (alongX) { cover(x, z + 1.2); cover(x, z - 1.2); } else { cover(x + 1.2, z); cover(x - 1.2, z); }
  }
  function lowWall(x, z, len, alongX) {
    if (alongX) box('concrete', x - len / 2, z - 0.25, x + len / 2, z + 0.25, 0, 1.1, 'low', 'lowwall');
    else box('concrete', x - 0.25, z - len / 2, x + 0.25, z + len / 2, 0, 1.1, 'low', 'lowwall');
    if (alongX) { cover(x, z + 1); cover(x, z - 1); } else { cover(x + 1, z); cover(x - 1, z); }
  }
  function barrel(x, z, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10), mat || new THREE.MeshLambertMaterial({ map: W.mats.darkwood.map }));
    m.position.set(x, PL + 0.5, z); root.add(m);
    [0.25, 0.75].forEach(function (hy) {
      const hp = new THREE.Mesh(hoopGeo, W.mats.trim); hp.rotation.x = Math.PI / 2; hp.position.set(x, PL + hy, z); root.add(hp);
    });
    invis(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0, 1.0, 'low', 'barrel');
  }
  function table(x, z, w, d) {
    box('wood', x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, 0.85, 'low', 'table');
  }
  function pillar(x, z, s, h, mat) {
    box(mat || 'marble', x - s / 2, z - s / 2, x + s / 2, z + s / 2, 0, h, 'solid', 'pillar');
    cover(x + s / 2 + 0.7, z);
  }

  function labelTex(text, w, h, bg, fg, font) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = fg; g.font = font || 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
    return new THREE.CanvasTexture(c);
  }
  function sign(text, x, y, z, rotY, w, h, bg, fg) {
    const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: labelTex(text, 256, 96, bg || '#12304f', fg || '#f4d35e') }));
    m.scale.set(w, h, 1); m.position.set(x, PL + y, z); m.rotation.y = rotY; m.userData.nos = true; root.add(m);
  }

  // ----------------------------------------------------------------- roads
  let roadIdx = 0;
  function addCurbs(alongX, c, a0, a1, width, cuts) {
    let segs = [[Math.max(a0, -116), Math.min(a1, 116)]];
    cuts.forEach(function (cu) {
      const out = [];
      segs.forEach(function (sg) {
        if (cu[1] <= sg[0] || cu[0] >= sg[1]) { out.push(sg); return; }
        if (cu[0] > sg[0]) out.push([sg[0], cu[0]]);
        if (cu[1] < sg[1]) out.push([cu[1], sg[1]]);
      });
      segs = out;
    });
    segs.forEach(function (sg) {
      if (sg[1] - sg[0] < 0.5) return;
      [-1, 1].forEach(function (side) {
        const e = c + side * (width / 2 + 0.1), t = 0.11;
        if (alongX) batch.box('concrete', sg[0], PL, e - t, sg[1], PL + 0.14, e + t);
        else batch.box('concrete', e - t, PL, sg[0], e + t, PL + 0.14, sg[1]);
      });
    });
  }
  function road(x0, z0, x1, z1, width, cuts) {
    const alongX = (z0 === z1);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const n = Math.max(1, Math.ceil(len / 4));
    const p = [], uv = [], idx = [];
    const sx = Math.sign(x1 - x0) || 0, sz = Math.sign(z1 - z0) || 0;
    const lift = 0.05 + (roadIdx++) * 0.006;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
      const px = alongX ? 0 : width / 2, pz = alongX ? width / 2 : 0;
      const ax = cx - px, az = cz - pz, bx = cx + px, bz = cz + pz;
      p.push(ax, W.groundAt(ax, az) + lift, az, bx, W.groundAt(bx, bz) + lift, bz);
      uv.push(0, t * len / 8, 1, t * len / 8);
      if (i < n) {
        const k = i * 2;
        if (alongX ? x1 > x0 : z1 < z0) idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
        else idx.push(k, k + 3, k + 1, k, k + 2, k + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // make sure normals point up
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    const mesh = new THREE.Mesh(geo, B.roadMat);
    mesh.userData.nos = true;
    root.add(mesh);
    if (cuts) addCurbs(alongX, alongX ? z0 : x0, Math.min(alongX ? x0 : z0, alongX ? x1 : z1), Math.max(alongX ? x0 : z0, alongX ? x1 : z1), width, cuts);
    if (alongX) W.mapRect(Math.min(x0, x1), z0 - width / 2, Math.max(x0, x1), z0 + width / 2, '#8d8d92');
    else W.mapRect(x0 - width / 2, Math.min(z0, z1), x0 + width / 2, Math.max(z0, z1), '#8d8d92');
  }

  // ----------------------------------------------------------------- generic house
  function house(cx, cz, w, d, doorSide, o) {
    o = o || {};
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const mat = o.mat || 'plaster', h = o.h || 3.2, th = 0.3;
    // floor
    box('wood', x0, z0, x1, z1, 0, 0.04);
    // walls: N (z0), S (z1), W (x0), E (x1)
    wall(mat, x0, z0, x1, z0, h, th, houseOps(w, doorSide === 'N', o.big));
    wall(mat, x0, z1, x1, z1, h, th, houseOps(w, doorSide === 'S', o.big));
    wall(mat, x0, z0, x0, z1, h, th, houseOps(d, doorSide === 'W', o.big));
    wall(mat, x1, z0, x1, z1, h, th, houseOps(d, doorSide === 'E', o.big));
    // flat roof slab (collider + visual) + gable on top
    box(mat, x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2, h, h + 0.3, 'solid', 'roof');
    gable(x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2, h + 0.3, o.rise || 1.5, mat);
    W.mapRect(x0, z0, x1, z1, o.mapColor || '#7d746a', '#1d1d1d');
    FOOT.push([x0, z0, x1, z1]);
    batch.box('lamp', cx - 0.6, PL + h - 0.07, cz - 0.3, cx + 0.6, PL + h, cz + 0.3);
    // chimney
    batch.box('brick', x0 + 1.2, PL + h, z0 + 1.0, x0 + 2.0, PL + h + 2.2, z0 + 1.8);
    batch.box('trim', x0 + 1.1, PL + h + 2.2, z0 + 0.9, x0 + 2.1, PL + h + 2.35, z0 + 1.9);
    if (o.label) {
      const sf = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[doorSide];
      sign(o.label, cx + sf[0] * (w / 2 + 0.2), 3.0, cz + sf[1] * (d / 2 + 0.2), Math.atan2(sf[0], sf[1]), 2.2, 0.42, '#3a2414', '#f1d9a0');
    }
    // interior frame (front = door side, pointing OUT)
    const f = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[doorSide];
    const fr = new Frame(cx, cz, f[0], f[1]);
    const lat = (f[0] !== 0 ? d : w) / 2, dep = (f[0] !== 0 ? w : d) / 2;
    const inYaw = yawOf(-f[0], -f[1]); // facing into the house? (towards back wall) - chests face the room
    if (o.kind === 'shop') {
      fr.box('wood', -lat + 1.2, lat - 1.2, -dep + 3.6, -dep + 4.5, 0, 1.1, 'low', 'counter');
      fr.box('shelf', -lat + 0.2, lat - 0.2, -dep + 0.2, -dep + 0.7, 0, 2.2, 'solid', 'shelf');
      cover(fr.x(0, -dep + 5.3), fr.z(0, -dep + 5.3));
    } else if (o.kind === 'home') {
      fr.box('cloth', -lat + 0.3, -lat + 2.3, -dep + 0.3, -dep + 2.0, 0, 0.7, 'low', 'bed');
      table(fr.x(lat * 0.35, -dep * 0.1), fr.z(lat * 0.35, -dep * 0.1), 1.6, 1.0);
      fr.box('red', lat - 2.3, lat - 0.4, dep * 0.15 - 0.4, dep * 0.15 + 0.4, 0, 0.8, 'low', 'sofa');
    }
    if (o.closet !== false) {
      hidingSpot('closet', fr.x(lat - 0.85, -dep + 0.72), fr.z(lat - 0.85, -dep + 0.72), f[0] * -1 * -1, f[1] * -1 * -1, 'wood');
    }
    if (o.chest) {
      const cu = -lat * 0.4, cv = -dep + 0.8;
      chest(o.chest, fr.x(cu, cv), fr.z(cu, cv), yawOf(f[0], f[1]), PL);
    }
    return { x0: x0, x1: x1, z0: z0, z1: z1, fr: fr, lat: lat, dep: dep, h: h };
  }

  // ----------------------------------------------------------------- bank
  function buildBank() {
    const x0 = -53, x1 = -23, z0 = -41, z1 = -19, h = 4.6;
    box('marble', x0, z0, x1, z1, 0, 0.04);
    // front (south, z1): main entrance + windows
    wall('concrete', x0, z1, x1, z1, h, 0.4, [
      { a: 3, w: 3, type: 'win', top: 3.2 }, { a: 7.5, w: 3, type: 'win', top: 3.2 },
      { a: 13.5, w: 3, type: 'door', top: 3.4 },
      { a: 19.5, w: 3, type: 'win', top: 3.2 }, { a: 24, w: 3, type: 'win', top: 3.2 }]);
    wall('concrete', x0, z0, x1, z0, h, 0.4, []);
    wall('concrete', x0, z0, x0, z1, h, 0.4, [{ a: 11, w: 3, type: 'win', top: 3.2 }, { a: 15.5, w: 3, type: 'win', top: 3.2 }]);
    wall('concrete', x1, z0, x1, z1, h, 0.4, [{ a: 11, w: 3, type: 'win', top: 3.2 }, { a: 15.5, w: 3, type: 'win', top: 3.2 }]);
    // vault partition with the heavy vault opening
    wall('vault', x0, -31, x1, -31, h, 0.7, [{ a: 13.5, w: 3, type: 'arch', top: 3.3 }]);
    box('vault', -40.2, -31.5, -39.5, -30.5, 0, 3.4, null);
    box('vault', -36.5, -31.5, -35.8, -30.5, 0, 3.4, null);
    box('gold', -40.2, -31.5, -35.8, -30.5, 3.3, 3.6, null);
    // roof
    box('concrete', x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h, h + 0.4, 'solid', 'roof');
    cornice(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h + 0.4, 0.55, 'marble');
    FOOT.push([x0, z0, x1, z1]);
    // pilasters + pediment on the front
    [-52.6, -46.25, -40.3, -35.7, -29.75, -23.4].forEach(function (px) {
      batch.box('marble', px - 0.35, PL, z1 + 0.2, px + 0.35, PL + h, z1 + 0.62);
      batch.box('marble', px - 0.45, PL, z1 + 0.2, px + 0.45, PL + 0.3, z1 + 0.7);
      batch.box('marble', px - 0.45, PL + h - 0.3, z1 + 0.2, px + 0.45, PL + h, z1 + 0.7);
    });
    batch.tri('marble', [-41.2, PL + h + 0.95, z1 + 0.5], [-34.8, PL + h + 0.95, z1 + 0.5], [-38, PL + h + 2.3, z1 + 0.5]);
    batch.box('marble', -41.4, PL + h + 0.4, z1 + 0.2, -34.6, PL + h + 0.95, z1 + 0.6);
    // heavy round vault door standing open beside the vault opening
    const vd = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.45, 28), W.mats.vault); vd.rotation.x = Math.PI / 2;
    vd.position.set(-34.2, PL + 1.55, -32.0); root.add(vd);
    const vr = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 8, 28), W.mats.metal); vr.position.set(-34.2, PL + 1.55, -32.25); root.add(vr);
    const vw = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), W.mats.gold); vw.position.set(-34.2, PL + 1.55, -32.3); root.add(vw);
    for (let b = 0; b < 8; b++) {
      const a = b / 8 * Math.PI * 2, bolt = new THREE.Mesh(boxGeo, W.mats.metal);
      bolt.scale.set(0.18, 0.18, 0.4); bolt.position.set(-34.2 + Math.cos(a) * 1.15, PL + 1.55 + Math.sin(a) * 1.15, -32.3); root.add(bolt);
    }
    batch.box('lamp', -46 - 0.7, PL + h - 0.07, -24.5 - 0.3, -46 + 0.7, PL + h, -24.5 + 0.3);
    batch.box('lamp', -38 - 0.7, PL + h - 0.07, -24.5 - 0.3, -38 + 0.7, PL + h, -24.5 + 0.3);
    batch.box('lamp', -30 - 0.7, PL + h - 0.07, -24.5 - 0.3, -30 + 0.7, PL + h, -24.5 + 0.3);
    batch.box('lamp', -44 - 0.7, PL + h - 0.07, -36 - 0.3, -44 + 0.7, PL + h, -36 + 0.3);
    batch.box('lamp', -33 - 0.7, PL + h - 0.07, -36 - 0.3, -33 + 0.7, PL + h, -36 + 0.3);
    batch.box('lamp', -38 - 0.7, PL + h - 0.07, -38 - 0.3, -38 + 0.7, PL + h, -38 + 0.3);

    sign('BANK', -38, 4.0, z1 + 0.25, 0, 5, 1.4, '#12304f', '#f4d35e');
    W.mapRect(x0, z0, x1, z1, '#b9b3a4', '#1d1d1d');
    // lobby: teller counters + breakable glass
    box('wood', -52, -27, -43, -26, 0, 1.1, 'low', 'counter');
    box('wood', -33, -27, -24, -26, 0, 1.1, 'low', 'counter');
    glassBlock(-51.5, PL + 1.1, -26.6, -43.5, PL + 2.4, -26.4);
    glassBlock(-32.5, PL + 1.1, -26.6, -24.5, PL + 2.4, -26.4);
    cover(-47, -24.6); cover(-28, -24.6);
    // pillars
    pillar(-47, -22.5, 1.1, h, 'marble'); pillar(-29, -22.5, 1.1, h, 'marble');
    pillar(-47, -29, 1.1, h, 'marble'); pillar(-29, -29, 1.1, h, 'marble');
    // carpet
    box('carpet', -40.5, -30.7, -35.5, -19.2, 0, 0.06);
    // vault room: safety deposit walls, gold piles
    box('metal', -52.8, -40.2, -52.0, -34, 0, 2.4, 'solid', 'deposit');
    box('metal', -24.0, -40.2, -23.2, -37, 0, 2.4, 'solid', 'deposit');
    box('metal', -46, -40.8, -38, -40.2, 0, 1.4, 'low', 'deposit');
    box('gold', -37.8, -40.6, -36.2, -39.6, 0, 0.5, 'low', 'gold');
    box('gold', -38.2, -40.6, -37.6, -39.9, 0.5, 0.9, null);
    [-48, -44, -32.5, -28].forEach(function (x) {
      box('gold', x - 1.0, -40.5, x - 0.5, -40.0, 0, 0.35, null);
      box('gold', x + 0.5, -40.5, x + 1.0, -40.0, 0, 0.35, null);
      chest('super', x, -39.6, Math.PI, PL);
    });
    // pillars in vault
    pillar(-41, -35.5, 1.0, h, 'vault'); pillar(-35, -35.5, 1.0, h, 'vault');
    // hiding lockers
    hidingSpot('locker', -23.75, -21.3, -1, 0, 'metal');
    hidingSpot('locker', -23.75, -22.5, -1, 0, 'metal');
    hidingSpot('locker', -23.75, -34.0, -1, 0, 'metal');
    // normal chests in lobby, station
    chest('normal', -51.6, -21.5, -Math.PI / 2, PL);
    chest('normal', -27.5, -29.5, yawOf(0, 1), PL);
    chest('custom', -51.6, -29.5, -Math.PI / 2, PL);
    station(-25.4, -24.6, Math.PI / 2);
    crate(-50, -36, 1.2);
  }

  // ----------------------------------------------------------------- museum
  function buildMuseum() {
    const x0 = 24, x1 = 64, z0 = 9, z1 = 39, h = 7.5, px = 46;
    box('marble', x0, z0, px, z1, 0, 0.05);
    box('darkwood', px, z0, x1, z1, 0, 0.05);
    wall('brick', x0, z0, x1, z0, h, 0.4, [
      { a: 2, w: 3.5, type: 'win', sill: 1.2, top: 4.2 }, { a: 9, w: 4, type: 'door', top: 4.2 },
      { a: 15.5, w: 3.5, type: 'win', sill: 1.2, top: 4.2 }, { a: 28, w: 3.5, type: 'win', sill: 1.2, top: 4.2 },
      { a: 34, w: 3.5, type: 'win', sill: 1.2, top: 4.2 }]);
    wall('brick', x0, z1, x1, z1, h, 0.4, [
      { a: 4, w: 3.5, type: 'win', sill: 1.2, top: 4.2 }, { a: 14, w: 3.5, type: 'win', sill: 1.2, top: 4.2 },
      { a: 30, w: 3.5, type: 'win', sill: 1.2, top: 4.2 }]);
    wall('brick', x0, z0, x0, z1, h, 0.4, [
      { a: 4, w: 3.5, type: 'win', sill: 1.2, top: 4.2 }, { a: 13, w: 3.5, type: 'win', sill: 1.2, top: 4.2 },
      { a: 22, w: 3.5, type: 'win', sill: 1.2, top: 4.2 }]);
    wall('brick', x1, z0, x1, z1, h, 0.4, [
      { a: 5, w: 3, type: 'win', sill: 1.2, top: 4.2 }, { a: 22, w: 3, type: 'win', sill: 1.2, top: 4.2 }]);
    // partition between hall and pirate section
    wall('darkwood', px, z0, px, z1, h, 0.4, [{ a: 11, w: 8, type: 'arch', top: 4.8 }]);
    box('plaster', x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h, h + 0.4, 'solid', 'roof');
    cornice(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h + 0.4, 0.9, 'stone');
    FOOT.push([x0, z0, x1, z1]);
    batch.box('lamp', 30 - 0.7, PL + h - 0.07, 12 - 0.3, 30 + 0.7, PL + h, 12 + 0.3);
    batch.box('lamp', 40 - 0.7, PL + h - 0.07, 12 - 0.3, 40 + 0.7, PL + h, 12 + 0.3);
    batch.box('lamp', 30 - 0.7, PL + h - 0.07, 24 - 0.3, 30 + 0.7, PL + h, 24 + 0.3);
    batch.box('lamp', 40 - 0.7, PL + h - 0.07, 24 - 0.3, 40 + 0.7, PL + h, 24 + 0.3);
    batch.box('lamp', 30 - 0.7, PL + h - 0.07, 34 - 0.3, 30 + 0.7, PL + h, 34 + 0.3);
    batch.box('lamp', 40 - 0.7, PL + h - 0.07, 34 - 0.3, 40 + 0.7, PL + h, 34 + 0.3);
    batch.box('lamp', 52 - 0.7, PL + h - 0.07, 15 - 0.3, 52 + 0.7, PL + h, 15 + 0.3);
    batch.box('lamp', 58 - 0.7, PL + h - 0.07, 15 - 0.3, 58 + 0.7, PL + h, 15 + 0.3);
    batch.box('lamp', 52 - 0.7, PL + h - 0.07, 35 - 0.3, 52 + 0.7, PL + h, 35 + 0.3);
    batch.box('lamp', 58 - 0.7, PL + h - 0.07, 35 - 0.3, 58 + 0.7, PL + h, 35 + 0.3);
    batch.box('lamp', 55 - 0.7, PL + h - 0.07, 24 - 0.3, 55 + 0.7, PL + h, 24 + 0.3);

    sign('MUSEUM', 35, 5.3, z0 - 0.25, Math.PI, 6.5, 1.5, '#3a2a14', '#f1d9a0');
    W.mapRect(x0, z0, x1, z1, '#c9b18a', '#1d1d1d');

    // --- main hall
    [[30, 17], [40, 17], [30, 31], [40, 31]].forEach(function (p) { pillar(p[0], p[1], 1.2, h, 'marble'); });
    // dinosaur skeleton on a pedestal
    box('marble', 29, 22.4, 41, 25.6, 0, 0.7, 'low', 'pedestal');
    for (let i = 0; i < 12; i++) {
      const x = 29.8 + i * 0.95;
      const thick = 0.35 - Math.abs(i - 5) * 0.015;
      box('bone', x, 23.85, x + 0.6, 24.15, 2.0 + (i > 7 ? (i - 7) * 0.12 : 0), 2.0 + thick + 0.3 + (i > 7 ? (i - 7) * 0.12 : 0), null);
      if (i > 1 && i < 8) {
        box('bone', x + 0.2, 23.0, x + 0.3, 23.1, 0.9, 2.1, null);
        box('bone', x + 0.2, 24.9, x + 0.3, 25.0, 0.9, 2.1, null);
      }
    }
    box('bone', 40.6, 23.5, 42.4, 24.5, 2.6, 3.4, null);   // skull
    box('bone', 33, 23.4, 33.3, 23.7, 0.7, 2.1, null); box('bone', 33, 24.3, 33.3, 24.6, 0.7, 2.1, null);
    box('bone', 37, 23.4, 37.3, 23.7, 0.7, 2.1, null); box('bone', 37, 24.3, 37.3, 24.6, 0.7, 2.1, null);
    cover(35, 21.8); cover(35, 26.2);
    // display cases (breakable glass)
    [[28.5, 13.5], [41, 13.5], [28.5, 34.5], [41, 34.5]].forEach(function (p) {
      box('marble', p[0] - 0.9, p[1] - 0.9, p[0] + 0.9, p[1] + 0.9, 0, 0.9, 'low', 'pedestal');
      glassBlock(p[0] - 0.85, PL + 0.9, p[1] - 0.85, p[0] + 0.85, PL + 2.0, p[1] + 0.85);
      box('gold', p[0] - 0.25, p[1] - 0.25, p[0] + 0.25, p[1] + 0.25, 0.9, 1.3, null);
      cover(p[0], p[1] + 1.8 * (p[1] > 24 ? -1 : 1));
    });
    // statues
    [[35, 14.5], [35, 34]].forEach(function (p) {
      box('marble', p[0] - 0.7, p[1] - 0.7, p[0] + 0.7, p[1] + 0.7, 0, 1.0, 'low', 'pedestal');
      box('stone', p[0] - 0.3, p[1] - 0.2, p[0] + 0.3, p[1] + 0.2, 1.0, 2.6, null);
      box('stone', p[0] - 0.2, p[1] - 0.2, p[0] + 0.2, p[1] + 0.2, 2.6, 3.1, null);
    });
    box('carpet', 33.5, 9.2, 36.5, 22, 0, 0.06);
    // closets (storage) on the west wall, chests, station
    hidingSpot('closet', 24.95, 29.8, 1, 0, 'wood');
    hidingSpot('closet', 24.95, 31.2, 1, 0, 'wood');
    chest('normal', 25.2, 37.2, 0, PL);
    chest('normal', 44.3, 12.4, yawOf(0, 1), PL);
    chest('normal', 26.2, 11.2, yawOf(1, 1), PL);
    station(25.6, 18.5, -Math.PI / 2);

    // --- pirate section
    // ship (dry-docked) : hull deck, stern cabin, mast, sails
    box('darkwood', 50, 21.5, 60, 26.5, 0, 0.9, 'solid', 'ship');
    box('darkwood', 60, 22.4, 62.2, 25.6, 0, 0.8, 'solid', 'ship');
    box('darkwood', 62.2, 23.2, 63.4, 24.8, 0, 0.7, 'solid', 'ship');
    box('darkwood', 50, 21.5, 53.5, 26.5, 0.9, 2.6, 'solid', 'cabin');
    box('darkwood', 53.5, 21.5, 60, 21.8, 0.9, 1.6, 'low', 'rail');
    box('darkwood', 53.5, 26.2, 60, 26.5, 0.9, 1.6, 'low', 'rail');
    box('trim', 49.7, 21.3, 60.3, 21.5, 0.6, 0.75, null); box('trim', 49.7, 26.5, 60.3, 26.7, 0.6, 0.75, null);
    const woodM = new THREE.MeshLambertMaterial({ map: W.mats.darkwood.map });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 6.3, 8), woodM);
    mast.position.set(56.5, PL + 0.9 + 3.15, 24); root.add(mast);
    invis(56.25, 23.75, 56.75, 24.25, 0.9, 9.9, 'solid', 'mast');
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), woodM);
    yard.rotation.x = Math.PI / 2; yard.position.set(56.5, PL + 5.9, 24); root.add(yard);
    const sailM = new THREE.MeshLambertMaterial({ map: W.mats.cloth.map, side: THREE.DoubleSide });
    const sail = new THREE.Mesh(planeGeo, sailM); sail.scale.set(5.4, 3.8, 1);
    sail.rotation.y = Math.PI / 2; sail.position.set(56.55, PL + 3.9, 24); root.add(sail);
    const flagM = new THREE.MeshBasicMaterial({ map: skullTex(), side: THREE.DoubleSide });
    const flag = new THREE.Mesh(planeGeo, flagM); flag.scale.set(2.0, 1.3, 1);
    flag.rotation.y = Math.PI / 2; flag.position.set(56.5, PL + 6.75, 24.2 + 1.0); root.add(flag);
    // cannons on the deck
    const cm = new THREE.MeshLambertMaterial({ color: 0x222226 });
    [[55, 22.4], [58, 22.4], [55, 25.6], [58, 25.6]].forEach(function (p) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 8), cm);
      c.rotation.z = Math.PI / 2; c.position.set(p[0], PL + 1.15, p[1]); root.add(c);
    });
    // wheel
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 12), woodM);
    wheel.position.set(53.9, PL + 1.7, 24); wheel.rotation.y = Math.PI / 2; root.add(wheel);
    // treasure + barrels
    box('gold', 47, 34, 49.5, 36.5, 0, 0.7, 'low', 'treasure');
    box('gold', 47.5, 34.5, 49, 36, 0.7, 1.1, null);
    box('gold', 60.5, 12, 63, 14.5, 0, 0.6, 'low', 'treasure');
    box('gold', 61, 33.6, 63.2, 36, 0, 0.6, 'low', 'treasure');
    barrel(48, 12); barrel(49, 12.9); barrel(47.8, 13.8); barrel(60.0, 37.6); barrel(58.9, 37.9);
    crate(52, 12.5, 1.1); crate(53.2, 13.3, 0.9); crate(50, 36.5, 1.2);
    box('darkwood', 56, 33, 59, 34.2, 0, 0.9, 'low', 'map table');
    // skeleton pirate decor
    box('bone', 50.6, 17, 51.0, 17.4, 0, 1.4, null);
    box('bone', 50.4, 17.0, 51.2, 17.4, 1.4, 1.8, null);
    pillar(50, 18.8, 0.9, h, 'darkwood'); pillar(60, 18.8, 0.9, h, 'darkwood');
    pillar(50, 31.2, 0.9, h, 'darkwood'); pillar(60, 31.2, 0.9, h, 'darkwood');
    // 3 super chests: on the ship deck + two in corners
    chest('super', 57.2, 25.5, yawOf(0, 1), PL + 0.9);
    chest('super', 62.8, 14.6, Math.PI / 2, PL);
    chest('super', 49.2, 38.0, yawOf(1, -1) + 0.0, PL);
    chest('custom', 63.0, 28.5, Math.PI / 2, PL);
    chest('normal', 47.0, 10.6, yawOf(1, 1), PL);
    // dressing: banners, coin piles, cannonballs, lanterns, rope, anchor
    const flagTex = skullTex();
    [[50, 18.8, 0x8c1d1d], [60, 18.8, 0x1d1d22], [50, 31.2, 0x1d1d22], [60, 31.2, 0x8c1d1d]].forEach(function (f) {
      const bm = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ color: f[2], map: flagTex, side: THREE.DoubleSide, roughness: 1 }));
      bm.scale.set(1.1, 1.7, 1); bm.rotation.y = Math.PI / 2; bm.position.set(f[0] + (f[0] < 55 ? 0.5 : -0.5), PL + 5.2, f[1]); root.add(bm);
    });
    const coinM = new THREE.MeshStandardMaterial({ color: 0xe0ac1c, roughness: 0.35, metalness: 0.75 });
    [[48.25, 35.2, 1.1], [61.75, 13.2, 0.9], [62.1, 34.8, 0.9]].forEach(function (c) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(c[2], c[2] * 0.7, 12), coinM); cone.position.set(c[0], PL + 0.6 + c[2] * 0.35, c[1]); root.add(cone);
    });
    const ballM = new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.5, metalness: 0.6 }), ballG = new THREE.SphereGeometry(0.2, 10, 8);
    [[51.5, 28.5], [51.9, 28.5], [51.7, 28.85]].forEach(function (b, i) {
      const sp = new THREE.Mesh(ballG, ballM); sp.position.set(b[0], PL + (i < 2 ? 0.2 : 0.55), b[1]); root.add(sp);
    });
    const ropeM = new THREE.MeshStandardMaterial({ color: 0xb59a64, roughness: 1 });
    for (let r = 0; r < 4; r++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.45 - r * 0.02, 0.07, 6, 14), ropeM); t.rotation.x = Math.PI / 2; t.position.set(48.6, PL + 0.08 + r * 0.12, 20.5); root.add(t); }
    const anchor = new THREE.Group();
    const am = W.mats.trim;
    const a1 = new THREE.Mesh(boxGeo, am); a1.scale.set(0.12, 1.8, 0.12); const a2 = new THREE.Mesh(boxGeo, am); a2.scale.set(1.0, 0.12, 0.12); a2.position.y = 0.55;
    const a3 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 12, Math.PI), am); a3.position.y = -0.85; a3.rotation.z = Math.PI;
    anchor.add(a1, a2, a3); anchor.position.set(63.55, PL + 2.4, 20); anchor.rotation.y = Math.PI / 2; root.add(anchor);
    const lanM = new THREE.MeshBasicMaterial({ color: 0xffc766 });
    [[50, 22], [50, 28], [60, 22], [60, 28], [46.6, 24], [63.4, 33]].forEach(function (l) {
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), lanM); lan.position.set(l[0], PL + 3.4, l[1]); root.add(lan);
      const hk = new THREE.Mesh(boxGeo, W.mats.trim); hk.scale.set(0.03, 0.9, 0.03); hk.position.set(l[0], PL + 4.0, l[1]); root.add(hk);
    });
    hidingSpot('crate', 62.8, 31.0, -1, 0, 'crate');
    hidingSpot('crate', 47.3, 31.0, 1, 0, 'crate');
  }
  function skullTex() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#eee';
    g.beginPath(); g.arc(64, 38, 22, 0, 6.3); g.fill();
    g.fillRect(50, 50, 28, 14);
    g.fillStyle = '#111'; g.beginPath(); g.arc(55, 38, 6, 0, 6.3); g.arc(73, 38, 6, 0, 6.3); g.fill();
    g.strokeStyle = '#eee'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(24, 78); g.lineTo(104, 62); g.moveTo(24, 62); g.lineTo(104, 78); g.stroke();
    return new THREE.CanvasTexture(c);
  }

  // ----------------------------------------------------------------- warehouse
  function buildWarehouse() {
    const cx = -55, cz = 58, w = 18, d = 12;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, h = 5;
    box('concrete', x0, z0, x1, z1, 0, 0.04);
    wall('metal', x0, z0, x1, z0, h, 0.3, [{ a: 3, w: 2.5, type: 'win', top: 3.6 }, { a: 11, w: 2.5, type: 'win', top: 3.6 }]);
    wall('metal', x0, z1, x1, z1, h, 0.3, [{ a: 3, w: 2.5, type: 'win', top: 3.6 }, { a: 11, w: 2.5, type: 'win', top: 3.6 }]);
    wall('metal', x0, z0, x0, z1, h, 0.3, [{ a: 4, w: 3, type: 'door', top: 3.4 }]);
    wall('metal', x1, z0, x1, z1, h, 0.3, [{ a: 4, w: 4, type: 'door', top: 3.6 }]);
    box('metal', x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h, h + 0.3, 'solid', 'roof');
    W.mapRect(x0, z0, x1, z1, '#6f747c', '#1d1d1d');
    FOOT.push([x0, z0, x1, z1]);
    cornice(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h + 0.3, 0.4, 'trim');
    batch.box('lamp', -59 - 0.7, PL + h - 0.07, 55 - 0.3, -59 + 0.7, PL + h, 55 + 0.3);
    batch.box('lamp', -53 - 0.7, PL + h - 0.07, 55 - 0.3, -53 + 0.7, PL + h, 55 + 0.3);
    batch.box('lamp', -59 - 0.7, PL + h - 0.07, 61 - 0.3, -59 + 0.7, PL + h, 61 + 0.3);
    batch.box('lamp', -53 - 0.7, PL + h - 0.07, 61 - 0.3, -53 + 0.7, PL + h, 61 + 0.3);

    // shelves + crates
    box('shelf', x0 + 1, z0 + 0.4, x0 + 9, z0 + 1.2, 0, 2.6, 'solid', 'shelf');
    box('shelf', x0 + 1, z1 - 1.2, x0 + 9, z1 - 0.4, 0, 2.6, 'solid', 'shelf');
    crate(cx + 3, cz - 2, 1.2); crate(cx + 4.3, cz - 2, 1.2); crate(cx + 3.6, cz - 2, 1.0);
    bigCrate(cx + 4, cz + 3, 2.2); bigCrate(cx - 1, cz + 1, 2.0);
    crate(cx - 4, cz - 1, 1.3);
    hidingSpot('locker', x0 + 0.95, z1 - 2.5, 0, -1, 'metal');
    hidingSpot('locker', x0 + 2.2, z1 - 1.3 + 0.0, 1, 0, 'metal');
    chest('normal', x1 - 1.0, z0 + 1.5, -Math.PI / 2, PL);
    chest('normal', cx + 1, z1 - 1.0, Math.PI, PL);
    chest('armor', x1 - 1.0, z1 - 1.5, -Math.PI / 2, PL);
    station(x1 - 0.9, cz + 0.5, -Math.PI / 2);
  }

  // ----------------------------------------------------------------- plaza + clock tower
  function clockTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f3ecd6'; g.beginPath(); g.arc(64, 64, 62, 0, 6.3); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#222';
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      g.fillRect(64 + Math.sin(a) * 50 - 3, 64 - Math.cos(a) * 50 - 3, 6, 6);
    }
    g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 28); g.moveTo(64, 64); g.lineTo(88, 74); g.stroke();
    const t = new THREE.CanvasTexture(c);
    return t;
  }
  function buildPlaza() {
    const px = 0, pz = 50;
    box('paver', px - 15, pz - 12, px + 15, pz + 12, 0, 0.07);
    W.mapRect(px - 15, pz - 12, px + 15, pz + 12, '#a8a597');
    FOOT.push([px - 15, pz - 12, px + 15, pz + 12]);
    // clock tower
    const tx = 0, tz = 59;
    box('brick', tx - 3, tz - 3, tx + 3, tz + 3, 0, 15, 'solid', 'tower');
    box('trim', tx - 3.4, tz - 3.4, tx + 3.4, tz + 3.4, 0, 0.8, null);
    box('stone', tx - 3.6, tz - 3.6, tx + 3.6, tz + 3.6, 15, 21, null);
    box('trim', tx - 4, tz - 4, tx + 4, tz + 4, 21, 21.6, null);
    // pyramid roof
    const a = [tx - 4, PL + 21.6, tz + 4], b = [tx + 4, PL + 21.6, tz + 4], c = [tx + 4, PL + 21.6, tz - 4], d = [tx - 4, PL + 21.6, tz - 4];
    const top = [tx, PL + 27, tz];
    batch.tri('roof', a, b, top); batch.tri('roof', b, c, top); batch.tri('roof', c, d, top); batch.tri('roof', d, a, top);
    const cm = new THREE.MeshBasicMaterial({ map: clockTex() });
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (s) {
      const m = new THREE.Mesh(planeGeo, cm);
      m.scale.set(5, 5, 1);
      m.position.set(tx + s[0] * 3.62, PL + 18, tz + s[1] * 3.62);
      m.rotation.y = Math.atan2(s[0], s[1]);
      root.add(m);
    });
    W.mapRect(tx - 3, tz - 3, tx + 3, tz + 3, '#6a6a6a', '#111');
    // fountain
    const fm = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.9, 16), new THREE.MeshLambertMaterial({ map: W.mats.paver.map }));
    fm.position.set(-9, PL + 0.45, 46); root.add(fm);
    const wm = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.2, 16), new THREE.MeshPhongMaterial({ color: 0x4aa3d8, shininess: 80 }));
    wm.position.set(-9, PL + 0.85, 46); root.add(wm);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.0, 8), new THREE.MeshLambertMaterial({ map: W.mats.paver.map }));
    sp.position.set(-9, PL + 1.5, 46); root.add(sp);
    invis(-12.2, 42.8, -5.8, 49.2, 0, 1.0, 'low', 'fountain');
    cover(-9, 51); cover(-9, 41.5);
    // cover around the capture point
    sandbags(8, 45, 3.5, false); sandbags(-4, 41, 3.5, true); sandbags(6, 56, 3.5, true);
    sandbags(10, 51, 2.5, false);
    crate(3, 45, 1.2); crate(4.3, 45.3, 1.0); lowWall(-7, 56, 4, true);
    // benches
    box('wood', 11, 38.5, 13.5, 39.1, 0, 0.5, 'low', 'bench');
    chest('normal', 6, 59, Math.PI / 2, PL);
    chest('armor', 12, 47, -Math.PI / 2, PL);
    station(9, 54, -Math.PI / 2);
  }

  // ----------------------------------------------------------------- dock
  function buildDock() {
    const wood = 'wood';
    batch.box(wood, -2.5, 0.2, 170, 2.5, 0.4, 218);
    W.box(-2.5, -0.6, 170, 2.5, 0.4, 218, 'solid', 'pier');
    batch.box(wood, 2.5, 0.2, 196, 9.5, 0.4, 199);
    batch.box(wood, -9.5, 0.2, 196, -2.5, 0.4, 199);
    W.box(2.5, -0.6, 196, 9.5, 0.4, 199, 'solid', 'pier');
    W.box(-9.5, -0.6, 196, -2.5, 0.4, 199, 'solid', 'pier');
    for (let z = 172; z <= 216; z += 6) {
      batch.box('darkwood', -2.8, -2.5, z - 0.2, -2.4, 0.9, z + 0.2);
      batch.box('darkwood', 2.4, -2.5, z - 0.2, 2.8, 0.9, z + 0.2);
    }
    W.mapRect(-2.5, 170, 2.5, 218, '#8b6a3a');
    W.mapRect(-9.5, 196, 9.5, 199, '#8b6a3a');
  }

  // ----------------------------------------------------------------- town
  function buildTown() {
    // roads
    const ringCuts = [[-4.3, 4.3], [-78.3, -71.7], [71.7, 78.3]];
    road(-112, 0, 112, 0, 8, ringCuts);
    road(0, -112, 0, 36, 8, [[-4.3, 4.3], [-78.3, -71.7]]);
    road(0, 64, 0, 178, 8, [[71.7, 78.3]]);
    road(-78, -75, 78, -75, 6, ringCuts); road(-78, 75, 78, 75, 6, ringCuts);
    road(-75, -78, -75, 78, 6, ringCuts); road(75, -78, 75, 78, 6, ringCuts);
    road(0, 36, 0, 38, 8); road(0, 62, 0, 64, 8);

    buildBank();
    buildMuseum();
    buildWarehouse();
    buildPlaza();
    buildDock();

    house(-60, 20, 12, 10, 'E', { kind: 'home', chest: 'normal' });
    house(-30, 24, 12, 10, 'N', { kind: 'home', chest: 'normal', mat: 'brick' });
    house(22, -30, 14, 10, 'S', { kind: 'shop', chest: 'normal', mat: 'brick', label: 'MARKET' });
    house(46, -30, 14, 10, 'S', { kind: 'shop', chest: 'normal', label: 'CAFE' });
    house(-58, -58, 12, 10, 'S', { kind: 'home', chest: 'custom' });
    house(58, -58, 12, 10, 'S', { kind: 'home', chest: 'normal', mat: 'brick' });
    house(58, 62, 12, 10, 'N', { kind: 'home', chest: 'normal' });
    house(-28, -62, 12, 10, 'S', { kind: 'home', chest: 'armor' });
    house(90, 20, 10, 8, 'W', { kind: 'home', chest: 'custom', mat: 'brick' });
    house(-95, -20, 10, 8, 'E', { kind: 'home', chest: 'normal' });

    // cover clusters on streets and around key places
    sandbags(-14, 8, 4, true); sandbags(14, -8, 4, true); sandbags(-40, -10, 4, true); sandbags(40, 10, 4, true);
    sandbags(0, -50, 3.5, true); sandbags(-20, -48, 3.5, true); sandbags(30, -45, 3.5, true);
    lowWall(-12, -10, 5, true); lowWall(18, 12, 5, true); lowWall(60, 5, 5, true); lowWall(-65, 0, 5, true);
    crate(-70, 40, 1.3); crate(-69, 41.3, 1.0); crate(65, -15, 1.3); crate(66.1, -14.2, 1.0);
    crate(-10, -20, 1.2); crate(50, 50, 1.2); crate(51, 51, 1.0); crate(-45, 80, 1.2);
    bigCrate(70, 40, 2.2); bigCrate(-80, -45, 2.2);
    // street lamps
    const lampM = 'trim';
    for (let x = -100; x <= 100; x += 25) {
      if (Math.abs(x) < 6) continue;
      box(lampM, x - 0.1, 4.6 - 0.1, x + 0.1, 4.8, 0, 5, 'solid', 'lamp');
      box('lamp', x - 0.25, 4.45, x + 0.25, 5.1, 5, 5.3, null);
    }
    for (let z = -100; z <= 100; z += 25) {
      if (Math.abs(z) < 6 || (z > 30 && z < 66)) continue;
      box(lampM, 4.6 - 0.1, z - 0.1, 4.8, z + 0.1, 0, 5, 'solid', 'lamp');
      box('lamp', 4.45, z - 0.25, 5.1, z + 0.25, 5, 5.3, null);
    }
    // little trees (blocky) along the main road and ring
    function tree(x, z) {
      box('darkwood', x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, 2.2, 'solid', 'tree');
      batch.box('leaf', x - 1.1, PL + 2.0, z - 1.1, x + 1.1, PL + 4.2, z + 1.1);
      batch.box('leaf', x - 0.7, PL + 4.2, z - 0.7, x + 0.7, PL + 5.0, z + 0.7);
    }
    [[-12, 12], [12, 12], [-12, -12], [-85, 40], [85, -40], [-85, -70], [85, 70], [-70, 85], [70, -85],
      [14, -50], [-14, 70], [20, 88], [-20, 88], [36, 75 + 8], [-100, 30], [100, -30]].forEach(function (p) { tree(p[0], p[1]); });
  }

  // ----------------------------------------------------------------- outdoor spots
  function freeSpot(x, z, r) {
    if (W.groundAt(x, z) < 0.3) return false;
    const cs = W.colliders;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (x > c.min.x - r && x < c.max.x + r && z > c.min.z - r && z < c.max.z + r) return false;
    }
    return true;
  }
  function onRoad(x, z) {
    return (Math.abs(z) < 6 && Math.abs(x) < 114) || (Math.abs(x) < 6 && z > -114 && z < 180) ||
      (Math.abs(Math.abs(z) - 75) < 5 && Math.abs(x) < 80) || (Math.abs(Math.abs(x) - 75) < 5 && Math.abs(z) < 80);
  }

  function outdoorSpots() {
    const rng = W.makeRng(4242);
    const plan = [['normal', 3], ['armor', 3], ['custom', 3]];
    plan.forEach(function (pl) {
      let n = 0, guard = 0;
      while (n < pl[1] && guard++ < 500) {
        const a = rng() * Math.PI * 2, r = 105 + rng() * 70;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!freeSpot(x, z, 2.0) || onRoad(x, z)) continue;
        if (W.teamSpawns.some(function (s) { return Math.hypot(s.to.x - x, s.to.z - z) < 25; })) continue;
        if (x > 8 && x < 55 && z > 140) continue;
        chest(pl[0], x, z, yawOf(-x, -z), undefined);
        // a bit of cover next to it
        if (Math.hypot(x, z) < 116) sandbags(x + 2, z, 2.5, false);
        n++;
      }
    });
    // armor crates at the four ring corners
    [[-67, -67], [67, -67], [-67, 67], [67, 67]].forEach(function (p) {
      chest('armor', p[0], p[1], yawOf(-p[0], -p[1]), PL);
      crate(p[0] + (p[0] > 0 ? 2 : -2), p[1], 1.2);
    });
  }

  function vehicleSpots() {
    carSpot(-30, 2, -Math.PI / 2); carSpot(55, -2, Math.PI / 2); carSpot(2, -45, Math.PI);
    carSpot(-2, 22, 0); carSpot(2, 95, Math.PI); carSpot(-73.5, 30, Math.PI);
    carSpot(73.5, -30, 0); carSpot(30, 73.5, -Math.PI / 2); carSpot(-40, -73.5, Math.PI / 2);
    // boats: two at the dock, the rest scattered round the coast
    W.vehicleSpots.push({ type: 'boat', pos: V3(-6.5, 0, 205), yaw: Math.PI });
    W.vehicleSpots.push({ type: 'boat', pos: V3(6.5, 0, 207), yaw: Math.PI });
    [20, 95, 150, 200, 250, 300].forEach(function (deg) {
      const a = deg * Math.PI / 180, dx = Math.cos(a), dz = Math.sin(a);
      let r = 240;
      while (r > 150 && W.heightAt(dx * r, dz * r) < -1.2) r -= 1;
      r += 6;
      const x = dx * r, z = dz * r;
      if (W.teamSpawns.some(function (s) { return Math.hypot(s.to.x - x, s.to.z - z) < 30; })) return;
      if (x > -14 && x < 14 && z > 160) return;
      W.vehicleSpots.push({ type: 'boat', pos: V3(x, 0, z), yaw: yawOf(dx, dz) });
    });
  }

  function controlPoints() {
    W.controlPoints.length = 0;
    W.controlPoints.push({ id: 'A', pos: V3(-38, PL, -25), radius: 8 });
    W.controlPoints.push({ id: 'B', pos: V3(35, PL, 18), radius: 8 });
    W.controlPoints.push({ id: 'C', pos: V3(0, PL, 50), radius: 8 });
  }

  // ----------------------------------------------------------------- init / update
  B.init = function () {
    W = COD.world;
    PL = W.PLATEAU;
    scene = COD.scene;
    batch = W.staticBatch || new W.Batch();
    root = new THREE.Group();
    root.name = 'buildings';
    planeGeo = new THREE.PlaneGeometry(1, 1);
    boxGeo = new THREE.BoxGeometry(1, 1, 1);
    hoopGeo = new THREE.TorusGeometry(0.43, 0.025, 6, 16);
    ['darkwood', 'concrete', 'metal', 'vault'].forEach(function (k) {
      W.mats[k].polygonOffset = true; W.mats[k].polygonOffsetFactor = -1; W.mats[k].polygonOffsetUnits = -1;
    });
    B.roadMat = new THREE.MeshStandardMaterial({ map: W._roadTex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    initShards();
    controlPoints();
    buildTown();
    outdoorSpots();
    vehicleSpots();
    // control point rings on the ground (flat discs)
    W.controlPoints.forEach(function (cp) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(cp.radius - 0.3, cp.radius, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(cp.pos.x, PL + 0.12, cp.pos.z);
      root.add(ring);
      W.mapDot(cp.pos.x, cp.pos.z, 5, 'rgba(255,255,255,0.35)');
    });
    if (W.addGrass) {
      W.addGrass(function (x, z) {
        if (!freeSpot(x, z, 0.9) || onRoad(x, z)) return false;
        for (let i = 0; i < FOOT.length; i++) { const f = FOOT[i]; if (x > f[0] - 1.8 && x < f[2] + 1.8 && z > f[1] - 1.8 && z < f[3] + 1.8) return false; }
        return true;
      });
    }
    if (scene) {
      batch.build(root);
      root.traverse(function (o) {
        if (!o.isMesh) return;
        const tr = o.material && o.material.transparent;
        o.castShadow = !tr && !o.userData.nos; o.receiveShadow = !tr;
      });
      scene.add(root);
    }
    W.buildNav();
  };

  const _tmp = new THREE.Vector3();
  B.update = function (dt) {
    for (let i = 0; i < shards.length; i++) {
      const s = shards[i];
      if (!s.visible) continue;
      const u = s.userData;
      u.vy -= 12 * dt;
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      s.rotation.x += 4 * dt; s.rotation.z += 3 * dt;
      u.life -= dt;
      if (u.life <= 0 || s.position.y < 0.05) s.visible = false;
    }
    const sp = W.hidingSpots;
    for (let i = 0; i < sp.length; i++) {
      const s = sp[i];
      if (s.occupant) {
        const o = s.occupant;
        if (o.alive === false || o.hidden !== s) {
          if (o.hidden === s) o.hidden = null;
          s.occupant = null; setDoor(s, false);
        }
      }
      if (s.interact) s.interact.enabled = !s.occupant;
    }
  };
})();
