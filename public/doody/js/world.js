/* Call of Doody - world.js (Chat 3)
   Island, ocean, sky, textures, colliders, raycast, resolveMove, pathfinding. */
(function () {
  'use strict';
  const COD = window.COD;
  const W = {};
  COD.world = W;

  const PL = 2.0;          // town plateau height
  const SIZE = 260;        // minimap half extent
  const STEP = 0.5;        // max auto step-up height
  const WORLD_LIMIT = 650; // soft sea boundary (radius)

  W.PLATEAU = PL;
  W.SIZE = SIZE;
  W.colliders = [];
  W.controlPoints = [];
  W.teamSpawns = [];
  W.chestSpots = [];
  W.stationSpots = [];
  W.vehicleSpots = [];
  W.coverPoints = [];
  W.hidingSpots = [];
  W.minimapCanvas = null;
  W.mats = {};
  W.staticBatch = null;

  // ---------------------------------------------------------------- utils
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  W.makeRng = mulberry32;
  const rnd = mulberry32(1337);
  function smooth(a, b, x) {
    let t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }
  W.faceYaw = function (dx, dz) { return Math.atan2(-dx, -dz); };

  // ---------------------------------------------------------------- terrain height
  const HILLS = [
    { x: -15, z: -162, h: 8, s: 17 }, { x: 166, z: 10, h: 7, s: 15 },
    { x: -162, z: -5, h: 7.5, s: 15 }, { x: 70, z: 160, h: 5, s: 13 },
    { x: -80, z: 150, h: 5.5, s: 14 }, { x: 95, z: -150, h: 5, s: 13 }
  ];

  function heightAt(x, z) {
    const r = Math.sqrt(x * x + z * z);
    if (r <= 120) return PL;
    const th = Math.atan2(z, x);
    const wob = 7 * Math.sin(3 * th + 1.0) + 4 * Math.sin(5 * th + 2.3) + 2.5 * Math.sin(9 * th);
    const re = r - wob * smooth(130, 170, r);
    let h;
    if (re < 190) {
      const t = (re - 120) / 70, s = t * t * (3 - 2 * t);
      h = PL * (1 - s);
    } else if (re < 235) {
      h = -(re - 190) * 0.1;
    } else {
      h = -4.5 - (re - 235) * 0.18;
      if (h < -26) h = -26;
    }
    const m = smooth(120, 150, r) * (1 - smooth(168, 188, r));
    if (m > 0) {
      let add = 0.5 * (Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06 + 0.4) + 0.5 * Math.sin(x * 0.17 + z * 0.13));
      for (let i = 0; i < HILLS.length; i++) {
        const hl = HILLS[i], dx = x - hl.x, dz = z - hl.z;
        add += hl.h * Math.exp(-(dx * dx + dz * dz) / (2 * hl.s * hl.s));
      }
      h += m * add;
    }
    return h;
  }
  W.heightAt = heightAt;
  W.isWater = function (x, z) { return heightAt(x, z) < 0; };
  function groundAt(x, z) { const h = heightAt(x, z); return h > 0 ? h : 0; }
  W.groundAt = groundAt;

  // ---------------------------------------------------------------- colliders
  W.addCollider = function (c) {
    const o = {
      min: c.min, max: c.max, type: c.type || 'solid',
      enabled: c.enabled !== false, onHit: c.onHit || null, tag: c.tag
    };
    W.colliders.push(o);
    return o;
  };
  W.removeCollider = function (c) {
    const i = W.colliders.indexOf(c);
    if (i >= 0) W.colliders.splice(i, 1);
  };
  /** Convenience: add collider from numbers (absolute y). */
  W.box = function (x0, y0, z0, x1, y1, z1, type, tag, onHit) {
    return W.addCollider({
      min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1),
      type: type || 'solid', tag: tag, onHit: onHit || null
    });
  };

  // ---------------------------------------------------------------- raycast
  function rayColliders(ox, oy, oz, dx, dy, dz, maxDist, ignoreWindows, out) {
    let best = maxDist, bc = null, bax = 0, bsign = 0;
    const cs = W.colliders;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.enabled) continue;
      if (ignoreWindows && c.type === 'window') continue;
      const mn = c.min, mx = c.max;
      let t0 = -Infinity, t1 = Infinity, ax = 0, sg = 0, ok = true;
      // X
      if (dx > -1e-9 && dx < 1e-9) { if (ox < mn.x || ox > mx.x) continue; }
      else {
        let a = (mn.x - ox) / dx, b = (mx.x - ox) / dx, s = -1;
        if (a > b) { const t = a; a = b; b = t; s = 1; }
        if (a > t0) { t0 = a; ax = 0; sg = s; }
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      if (dy > -1e-9 && dy < 1e-9) { if (oy < mn.y || oy > mx.y) continue; }
      else {
        let a = (mn.y - oy) / dy, b = (mx.y - oy) / dy, s = -1;
        if (a > b) { const t = a; a = b; b = t; s = 1; }
        if (a > t0) { t0 = a; ax = 1; sg = s; }
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      if (dz > -1e-9 && dz < 1e-9) { if (oz < mn.z || oz > mx.z) continue; }
      else {
        let a = (mn.z - oz) / dz, b = (mx.z - oz) / dz, s = -1;
        if (a > b) { const t = a; a = b; b = t; s = 1; }
        if (a > t0) { t0 = a; ax = 2; sg = s; }
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      if (t0 < 0 || t0 >= best) continue;   // origin inside a box = ignored
      best = t0; bc = c; bax = ax; bsign = sg;
    }
    out.t = best; out.c = bc; out.ax = bax; out.sg = bsign;
    return bc;
  }

  const _rc = { t: 0, c: null, ax: 0, sg: 0 };
  W.raycast = function (origin, dir, maxDist, ignoreWindows) {
    let dx = dir.x, dy = dir.y, dz = dir.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return null;
    if (Math.abs(len - 1) > 1e-4) { dx /= len; dy /= len; dz /= len; }
    const ox = origin.x, oy = origin.y, oz = origin.z;
    if (maxDist === undefined || maxDist === null) maxDist = 500;
    rayColliders(ox, oy, oz, dx, dy, dz, maxDist, ignoreWindows, _rc);
    let best = _rc.t, coll = _rc.c;
    let nx = 0, ny = 0, nz = 0;
    if (coll) {
      if (_rc.ax === 0) nx = _rc.sg; else if (_rc.ax === 1) ny = _rc.sg; else nz = _rc.sg;
    }
    // terrain / water march
    const skipTerrain = (oy > 30 && dy >= 0) || (oy > 14 && dy >= 0);
    if (!skipTerrain) {
      let prevAbove = oy >= groundAt(ox, oz);
      let t = 0, prevT = 0;
      const lim = best;
      while (t < lim) {
        t += (t < 60 ? 1.0 : 2.5);
        if (t > lim) t = lim;
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        const above = y >= groundAt(x, z);
        if (above) { prevAbove = true; prevT = t; }
        else if (prevAbove) {
          let a = prevT, b = t;
          for (let k = 0; k < 7; k++) {
            const m = (a + b) * 0.5;
            if (oy + dy * m >= groundAt(ox + dx * m, oz + dz * m)) a = m; else b = m;
          }
          best = b; coll = null;
          const px = ox + dx * b, pz = oz + dz * b;
          const gx = groundAt(px + 0.5, pz) - groundAt(px - 0.5, pz);
          const gz = groundAt(px, pz + 0.5) - groundAt(px, pz - 0.5);
          const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
          nx = -gx * il; ny = il; nz = -gz * il;
          break;
        }
        if (t >= lim) break;
      }
    }
    if (best >= maxDist && !coll) return null;
    if (best > maxDist) return null;
    return {
      point: new THREE.Vector3(ox + dx * best, oy + dy * best, oz + dz * best),
      dist: best, normal: new THREE.Vector3(nx, ny, nz), collider: coll
    };
  };

  const _lv = new THREE.Vector3(), _ld = new THREE.Vector3();
  W.lineOfSight = function (a, b) {
    _ld.subVectors(b, a);
    const len = _ld.length();
    if (len < 0.01) return true;
    _ld.multiplyScalar(1 / len);
    const h = W.raycast(a, _ld, len - 0.05, true);
    return h === null;
  };

  // ---------------------------------------------------------------- movement
  W.resolveMove = function (pos, delta, radius, height) {
    const cs = W.colliders, n = cs.length;
    const oldY = pos.y;
    let blocked = null;
    if (delta.x !== 0) {
      pos.x += delta.x;
      for (let i = 0; i < n; i++) {
        const c = cs[i]; if (!c.enabled) continue;
        const mn = c.min, mx = c.max;
        if (pos.x + radius > mn.x && pos.x - radius < mx.x && pos.z + radius > mn.z && pos.z - radius < mx.z &&
            mx.y > oldY + STEP && mn.y < oldY + height) {
          pos.x = delta.x > 0 ? mn.x - radius : mx.x + radius;
          blocked = c;
        }
      }
    }
    if (delta.z !== 0) {
      pos.z += delta.z;
      for (let i = 0; i < n; i++) {
        const c = cs[i]; if (!c.enabled) continue;
        const mn = c.min, mx = c.max;
        if (pos.x + radius > mn.x && pos.x - radius < mx.x && pos.z + radius > mn.z && pos.z - radius < mx.z &&
            mx.y > oldY + STEP && mn.y < oldY + height) {
          pos.z = delta.z > 0 ? mn.z - radius : mx.z + radius;
          blocked = c;
        }
      }
    }
    // sea boundary
    const rr = pos.x * pos.x + pos.z * pos.z;
    if (rr > WORLD_LIMIT * WORLD_LIMIT) {
      const k = WORLD_LIMIT / Math.sqrt(rr); pos.x *= k; pos.z *= k;
    }
    // vertical
    let ny = oldY + delta.y;
    let gy = groundAt(pos.x, pos.z);
    const m = radius * 0.5;
    for (let i = 0; i < n; i++) {
      const c = cs[i]; if (!c.enabled) continue;
      const mn = c.min, mx = c.max;
      if (pos.x > mn.x - m && pos.x < mx.x + m && pos.z > mn.z - m && pos.z < mx.z + m && mx.y <= oldY + STEP && mx.y > gy) {
        gy = mx.y;
      }
    }
    let onGround = false, hitCeiling = false;
    if (delta.y <= 0) {
      if (ny - gy < 0.12) { ny = gy; onGround = true; }
    } else {
      if (ny < gy) { ny = gy; onGround = true; }
      else {
        for (let i = 0; i < n; i++) {
          const c = cs[i]; if (!c.enabled) continue;
          const mn = c.min, mx = c.max;
          if (pos.x + radius > mn.x && pos.x - radius < mx.x && pos.z + radius > mn.z && pos.z - radius < mx.z &&
              mn.y >= oldY + height - 0.06 && mn.y < ny + height) {
            ny = mn.y - height; hitCeiling = true;
          }
        }
      }
    }
    pos.y = ny;
    return { onGround: onGround, blocked: blocked, hitCeiling: hitCeiling };
  };

  // ---------------------------------------------------------------- navigation (grid A*)
  const NAVR = 215, NAVN = NAVR * 2;
  let navWalk = null, closedS = null, stamp = null, gScore = null, parent = null, fScore = null, curStamp = 0;
  let heap = null, heapN = 0;

  W.buildNav = function () {
    navWalk = new Uint8Array(NAVN * NAVN);
    for (let j = 0; j < NAVN; j++) {
      for (let i = 0; i < NAVN; i++) {
        navWalk[j * NAVN + i] = heightAt(i - NAVR + 0.5, j - NAVR + 0.5) > 0.08 ? 1 : 0;
      }
    }
    const pad = 0.38;
    for (let k = 0; k < W.colliders.length; k++) {
      const c = W.colliders[k];
      if (!c.enabled) continue;
      const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
      const g = groundAt(cx, cz);
      if (c.max.y < g + 0.45 || c.min.y > g + 2.0) continue;
      const i0 = Math.max(0, Math.floor(c.min.x - pad + NAVR)), i1 = Math.min(NAVN - 1, Math.floor(c.max.x + pad + NAVR));
      const j0 = Math.max(0, Math.floor(c.min.z - pad + NAVR)), j1 = Math.min(NAVN - 1, Math.floor(c.max.z + pad + NAVR));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = i - NAVR + 0.5, z = j - NAVR + 0.5;
          if (x > c.min.x - pad && x < c.max.x + pad && z > c.min.z - pad && z < c.max.z + pad) navWalk[j * NAVN + i] = 0;
        }
      }
    }
    stamp = new Int32Array(NAVN * NAVN);
    closedS = new Int32Array(NAVN * NAVN);
    gScore = new Float32Array(NAVN * NAVN);
    fScore = new Float32Array(NAVN * NAVN);
    parent = new Int32Array(NAVN * NAVN);
    heap = new Int32Array(NAVN * NAVN);
    curStamp = 0;
  };

  function navOk(x, z) {
    const i = Math.floor(x + NAVR), j = Math.floor(z + NAVR);
    if (i < 0 || j < 0 || i >= NAVN || j >= NAVN) return false;
    return navWalk[j * NAVN + i] === 1;
  }
  W.navWalkable = navOk;

  function heapPush(idx) {
    let i = heapN++;
    heap[i] = idx;
    const f = fScore[idx];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fScore[heap[p]] <= f) break;
      heap[i] = heap[p]; i = p;
    }
    heap[i] = idx;
  }
  function heapPop() {
    const top = heap[0];
    const last = heap[--heapN];
    if (heapN > 0) {
      const f = fScore[last];
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= heapN) break;
        if (c + 1 < heapN && fScore[heap[c + 1]] < fScore[heap[c]]) c++;
        if (fScore[heap[c]] >= f) break;
        heap[i] = heap[c]; i = c;
      }
      heap[i] = last;
    }
    return top;
  }

  function snapCell(x, z) {
    let i = Math.floor(x + NAVR), j = Math.floor(z + NAVR);
    i = Math.max(0, Math.min(NAVN - 1, i)); j = Math.max(0, Math.min(NAVN - 1, j));
    if (navWalk[j * NAVN + i]) return j * NAVN + i;
    for (let r = 1; r <= 14; r++) {
      let best = -1, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= NAVN || jj >= NAVN) continue;
          if (!navWalk[jj * NAVN + ii]) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = jj * NAVN + ii; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  function lineClear(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) return true;
    const nx = -dz / len * 0.3, nz = dx / len * 0.3;
    const steps = Math.ceil(len / 0.5);
    for (let s = 1; s < steps; s++) {
      const t = s / steps, x = ax + dx * t, z = az + dz * t;
      if (!navOk(x, z) || !navOk(x + nx, z + nz) || !navOk(x - nx, z - nz)) return false;
    }
    return true;
  }

  W.findPath = function (from, to) {
    if (!navWalk) return [to.clone ? to.clone() : to];
    const s = snapCell(from.x, from.z), g = snapCell(to.x, to.z);
    if (s < 0 || g < 0) return [to.clone()];
    if (s === g) return [to.clone()];
    curStamp++;
    heapN = 0;
    const gx = g % NAVN, gz = (g / NAVN) | 0;
    const H = 1.25;
    stamp[s] = curStamp; gScore[s] = 0; parent[s] = -1;
    fScore[s] = 0; heapPush(s);
    let found = false, expansions = 0;
    while (heapN > 0) {
      const cur = heapPop();
      if (closedS[cur] === curStamp) continue;
      closedS[cur] = curStamp;
      if (cur === g) { found = true; break; }
      if (++expansions > 70000) break;
      const cx = cur % NAVN, cz = (cur / NAVN) | 0;
      const cg = gScore[cur];
      for (let d = 0; d < 8; d++) {
        const ddx = d === 0 ? 1 : d === 1 ? -1 : d === 2 ? 0 : d === 3 ? 0 : d === 4 ? 1 : d === 5 ? 1 : d === 6 ? -1 : -1;
        const ddz = d === 0 ? 0 : d === 1 ? 0 : d === 2 ? 1 : d === 3 ? -1 : d === 4 ? 1 : d === 5 ? -1 : d === 6 ? 1 : -1;
        const nx = cx + ddx, nz = cz + ddz;
        if (nx < 0 || nz < 0 || nx >= NAVN || nz >= NAVN) continue;
        const ni = nz * NAVN + nx;
        if (!navWalk[ni]) continue;
        if (ddx !== 0 && ddz !== 0) {
          if (!navWalk[cz * NAVN + nx] || !navWalk[nz * NAVN + cx]) continue;
        }
        const ng = cg + (ddx !== 0 && ddz !== 0 ? 1.4142 : 1);
        if (stamp[ni] === curStamp && gScore[ni] <= ng) continue;
        stamp[ni] = curStamp; gScore[ni] = ng; parent[ni] = cur;
        const ex = Math.abs(nx - gx), ez = Math.abs(nz - gz);
        fScore[ni] = ng + H * (ex + ez - 0.5858 * Math.min(ex, ez));
        heapPush(ni);
      }
    }
    if (!found) return [to.clone()];
    const cells = [];
    for (let c = g; c !== -1; c = parent[c]) cells.push(c);
    cells.reverse();
    // string pulling
    const pts = [];
    let ax = from.x, az = from.z, k = 0;
    const px = function (c) { return (c % NAVN) - NAVR + 0.5; };
    const pz = function (c) { return ((c / NAVN) | 0) - NAVR + 0.5; };
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = cells.length - 1; m > k + 1; m--) {
        if (lineClear(ax, az, px(cells[m]), pz(cells[m]))) { far = m; break; }
      }
      pts.push(cells[far]);
      ax = px(cells[far]); az = pz(cells[far]); k = far;
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const x = px(pts[i]), z = pz(pts[i]);
      out.push(new THREE.Vector3(x, groundAt(x, z), z));
    }
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - to.x, last.z - to.z) < 3) {
      if (last) { last.set(to.x, last.y, to.z); } else out.push(to.clone());
    }
    return out;
  };

  W.randomLandPoint = function () {
    for (let t = 0; t < 200; t++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 170;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (navWalk ? navOk(x, z) : heightAt(x, z) > 0.3) return new THREE.Vector3(x, groundAt(x, z), z);
    }
    return new THREE.Vector3(0, PL, 0);
  };

  // ---------------------------------------------------------------- textures
  function mkTex(size, fn, srgb) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    fn(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function fillNoise(g, s, base, vars, count, minS, maxS) {
    count = Math.round(count * (s / 128) * (s / 128));
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < count; i++) {
      g.fillStyle = vars[(rnd() * vars.length) | 0];
      const w = minS + rnd() * (maxS - minS), x = rnd() * s, y = rnd() * s;
      g.fillRect(x, y, w, w);
      if (x + w > s) g.fillRect(x - s, y, w, w);
      if (y + w > s) g.fillRect(x, y - s, w, w);
    }
  }
  const TEX = {
    terrain: function (g, s) { fillNoise(g, s, '#d4d4d4', ['#c4c4c4', '#e2e2e2', '#bcbcbc', '#eeeeee'], 900, 1, 3); },
    sand: function (g, s) { fillNoise(g, s, '#e3d3a4', ['#d6c590', '#efe2b8', '#cdbb85'], 700, 1, 3); },
    rock: function (g, s) { fillNoise(g, s, '#8a8a8a', ['#777', '#999', '#6a6a6a', '#a4a4a4'], 500, 2, 8); },
    road: function (g, s) {
      fillNoise(g, s, '#8a8a90', ['#7c7c82', '#979799', '#707076', '#a2a2a6'], 700, 1, 3);
      g.fillStyle = '#d8c34a'; g.fillRect(s / 2 - 2, 0, 4, s * 0.5);
      g.fillStyle = '#cfcfcf'; g.fillRect(3, 0, 3, s); g.fillRect(s - 6, 0, 3, s);
    },
    water: function (g, s) {
      g.fillStyle = '#2f86b8'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) {
        const x = rnd() * s, y = rnd() * s, w = 10 + rnd() * 30;
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(10,50,90,0.12)';
        for (let ox = -s; ox <= s; ox += s) for (let oy = -s; oy <= s; oy += s) {
          g.beginPath(); g.ellipse(x + ox, y + oy, w, w * 0.3, 0, 0, 6.3); g.fill();
        }
      }
    },
    waterTop: function (g, s) {
      g.clearRect(0, 0, s, s);
      for (let i = 0; i < 90; i++) {
        const x = rnd() * s, y = rnd() * s, w = 6 + rnd() * 18;
        g.fillStyle = 'rgba(255,255,255,' + (0.1 + rnd() * 0.25).toFixed(2) + ')';
        for (let ox = -s; ox <= s; ox += s) for (let oy = -s; oy <= s; oy += s) {
          g.beginPath(); g.ellipse(x + ox, y + oy, w, w * 0.18, 0, 0, 6.3); g.fill();
        }
      }
    },
    plaster: function (g, s) { fillNoise(g, s, '#e8dcc4', ['#e0d4bb', '#eee3cc', '#dacdb3'], 400, 1, 3); },
    brick: function (g, s) {
      g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, s, s);
      const bh = s / 8, bw = s / 4;
      for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) {
        const off = (r % 2) * bw / 2;
        const v = 120 + ((rnd() * 40) | 0);
        g.fillStyle = 'rgb(' + (v + 45) + ',' + (v - 25) + ',' + (v - 40) + ')';
        g.fillRect(c * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3);
      }
    },
    concrete: function (g, s) { fillNoise(g, s, '#b4b2ae', ['#b0aeaa', '#b9b7b2', '#acaaa6'], 300, 1, 2); },
    wood: function (g, s) {
      for (let i = 0; i < 8; i++) {
        const v = 110 + ((rnd() * 35) | 0);
        g.fillStyle = 'rgb(' + (v + 35) + ',' + (v - 5) + ',' + (v - 55) + ')';
        g.fillRect(0, i * s / 8, s, s / 8);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, i * s / 8, s, 2);
        for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(60,30,10,0.18)'; g.fillRect(rnd() * s, i * s / 8 + rnd() * s / 8, 10 + rnd() * 30, 1); }
      }
    },
    darkwood: function (g, s) {
      for (let i = 0; i < 8; i++) {
        const v = 95 + ((rnd() * 30) | 0);
        g.fillStyle = 'rgb(' + (v + 30) + ',' + (v + 8) + ',' + (v - 18) + ')';
        g.fillRect(0, i * s / 8, s, s / 8);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, i * s / 8, s, 2);
        for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(rnd() * s, i * s / 8 + rnd() * s / 8, 10 + rnd() * 30, 1); }
      }
    },
    marble: function (g, s) {
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        g.fillStyle = (i + j) % 2 ? '#ebe8e2' : '#d3cfc6';
        g.fillRect(i * s / 4, j * s / 4, s / 4, s / 4);
      }
      g.strokeStyle = 'rgba(80,80,80,0.25)'; g.lineWidth = 1;
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(rnd() * s, rnd() * s); g.lineTo(rnd() * s, rnd() * s); g.stroke(); }
    },
    roof: function (g, s) {
      g.fillStyle = '#7a3b2a'; g.fillRect(0, 0, s, s);
      for (let r = 0; r < 8; r++) {
        const v = (rnd() * 30) | 0;
        g.fillStyle = 'rgb(' + (140 + v) + ',' + (70 + v / 2) + ',' + (50) + ')';
        g.fillRect(0, r * s / 8 + 1, s, s / 8 - 2);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, r * s / 8 + s / 8 - 3, s, 2);
      }
    },
    metal: function (g, s) {
      g.fillStyle = '#8c929a'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 24; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(0, rnd() * s, s, 3); }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeRect(2, 2, s - 4, s - 4);
    },
    vault: function (g, s) {
      g.fillStyle = '#868c96'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#4a4e56';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(8 + i * s / 4, 8 + j * s / 4, 3, 0, 6.3); g.fill(); }
    },
    carpet: function (g, s) {
      fillNoise(g, s, '#7a1f2b', ['#6c1a25', '#862634'], 500, 1, 3);
      g.strokeStyle = '#c9a54a'; g.lineWidth = 3; g.strokeRect(6, 6, s - 12, s - 12);
    },
    sandbag: function (g, s) {
      g.fillStyle = '#9d8a5c'; g.fillRect(0, 0, s, s);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const off = (r % 2) * s / 6;
        g.fillStyle = (r + c) % 2 ? '#b09c6a' : '#a38f5f';
        g.beginPath(); g.ellipse(c * s / 3 + off + s / 6, r * s / 4 + s / 8, s / 6 - 2, s / 8 - 2, 0, 0, 6.3); g.fill();
      }
    },
    crate: function (g, s) {
      g.fillStyle = '#a57a40'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#6b4a22'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.lineWidth = 4; g.stroke();
    },
    leaf: function (g, s) { fillNoise(g, s, '#3f7d35', ['#356e2d', '#4a8f3d', '#2f6428'], 500, 1, 4); },
    paver: function (g, s) {
      g.fillStyle = '#8d8a82'; g.fillRect(0, 0, s, s);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const v = 150 + ((rnd() * 30) | 0);
        g.fillStyle = 'rgb(' + v + ',' + (v - 4) + ',' + (v - 12) + ')';
        g.fillRect(i * s / 4 + 1.5, j * s / 4 + 1.5, s / 4 - 3, s / 4 - 3);
      }
    },
    gold: function (g, s) {
      g.fillStyle = '#d4a017'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 80; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,150,0.35)' : 'rgba(120,80,0,0.25)'; g.fillRect(rnd() * s, rnd() * s, 3, 3); }
    },
    cloth: function (g, s) { fillNoise(g, s, '#e9e1cc', ['#ddd3b8', '#f3ecd9'], 300, 1, 3); },
    shelf: function (g, s) {
      g.fillStyle = '#6f4e2a'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 4; i++) { g.fillStyle = '#4c3418'; g.fillRect(0, i * s / 4, s, 4); }
    }
  };

  // extra textures for the graphics pass (own RNG so older random layouts never shift)
  const trnd = mulberry32(90210);
  function tnoise(g, s, base, vars, count, minS, maxS) {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < count; i++) {
      g.fillStyle = vars[(trnd() * vars.length) | 0];
      const w = minS + trnd() * (maxS - minS), h = minS + trnd() * (maxS - minS), x = trnd() * s, y = trnd() * s;
      g.fillRect(x, y, w, h);
      if (x + w > s) g.fillRect(x - s, y, w, h);
      if (y + h > s) g.fillRect(x, y - s, w, h);
    }
  }
  function smoothTex(g, s, px) {
    if (!('filter' in g)) return;
    g.filter = 'blur(' + px + 'px)';
    g.drawImage(g.canvas, 0, 0);
    g.filter = 'none';
  }
  const TEXN = {
    sandT: function (g, s) {
      tnoise(g, s, '#dccb98', ['#d6c590', '#e2d19e', '#d2c08c', '#e4d5a4'], 5200, 1, 2); smoothTex(g, s, 1.4);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(150,130,90,0.25)'; g.fillRect(trnd() * s, trnd() * s, 6 + trnd() * 14, 1); }
    },
    grassT: function (g, s) {
      tnoise(g, s, '#47692f', ['#40622b', '#4e7034', '#3c5e28', '#557838'], 4200, 1, 3); smoothTex(g, s, 1.3);
      g.lineWidth = 1;
      for (let i = 0; i < 1500; i++) {
        const x = trnd() * s, y = trnd() * s, l = 3 + trnd() * 6, a = -1.57 + (trnd() - 0.5) * 0.9;
        g.strokeStyle = trnd() < 0.5 ? 'rgba(100,140,60,0.5)' : 'rgba(40,90,30,0.5)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    },
    rockT: function (g, s) {
      tnoise(g, s, '#85827c', ['#74716b', '#96938c', '#67645f', '#a6a39b'], 2600, 2, 9);
      g.strokeStyle = 'rgba(40,40,40,0.35)';
      for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(trnd() * s, trnd() * s); g.lineTo(trnd() * s, trnd() * s); g.stroke(); }
    },
    bumpT: function (g, s) {
      tnoise(g, s, '#808080', ['#6a6a6a', '#9a9a9a', '#757575', '#8c8c8c'], 3000, 1, 4); smoothTex(g, s, 1.0);
    },
    blade: function (g, s) {
      g.clearRect(0, 0, s, s);
      for (let i = 0; i < 16; i++) {
        const x = 4 + trnd() * (s - 8), h = s * (0.45 + trnd() * 0.5), w = 2 + trnd() * 3, lean = (trnd() - 0.5) * 12;
        const gr = g.createLinearGradient(0, s, 0, s - h);
        gr.addColorStop(0, '#2d5a1f'); gr.addColorStop(1, '#bfe07a');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(x - w, s); g.quadraticCurveTo(x, s - h * 0.6, x + lean, s - h); g.quadraticCurveTo(x + w * 0.2, s - h * 0.5, x + w, s); g.fill();
      }
    }
  };

  // key -> [textureKey, tileMetres, extra props]
  const MATDEFS = {
    plaster: ['plaster', 3], brick: ['brick', 3], concrete: ['concrete', 3], wood: ['wood', 2],
    darkwood: ['darkwood', 2], marble: ['marble', 2], roof: ['roof', 3], metal: ['metal', 2],
    vault: ['vault', 2], carpet: ['carpet', 3], sandbag: ['sandbag', 1.5], crate: ['crate', 1.2],
    leaf: ['leaf', 2], paver: ['paver', 2], gold: ['gold', 1.5], cloth: ['cloth', 2], shelf: ['shelf', 1.5],
    rock: ['rock', 4], sand: ['sand', 4]
  };

  // per-material PBR feel: [roughness, metalness, bumpScale]
  const MATPBR = {
    plaster: [0.95, 0, 0.25], brick: [0.9, 0, 1.0], concrete: [0.92, 0, 0.12], wood: [0.8, 0, 0.5],
    darkwood: [0.75, 0, 0.5], marble: [0.4, 0.05, 0.1], roof: [0.8, 0, 0.8], metal: [0.5, 0.4, 0.1],
    vault: [0.4, 0.5, 0.2], carpet: [1, 0, 0.5], sandbag: [1, 0, 0.8], crate: [0.85, 0, 0.6],
    leaf: [0.9, 0, 0.5], paver: [0.9, 0, 0.5], gold: [0.3, 0.7, 0.4], cloth: [1, 0, 0.4], shelf: [0.85, 0, 0.8],
    rock: [0.95, 0, 1.0], sand: [1, 0, 0.5]
  };

  function stdMat(color, rough, metal, emissive) {
    const m = new THREE.MeshStandardMaterial({ color: color, roughness: rough, metalness: metal });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 0.8; }
    m.userData.tile = 1;
    return m;
  }

  function buildMaterials() {
    const texCache = {};
    for (const k in MATDEFS) {
      const d = MATDEFS[k];
      if (!texCache[d[0]]) texCache[d[0]] = mkTex(256, TEX[d[0]]);
      const p = MATPBR[k] || [0.9, 0, 0.5];
      const m = new THREE.MeshStandardMaterial({
        map: texCache[d[0]], bumpMap: texCache[d[0]], bumpScale: p[2], roughness: p[0], metalness: p[1]
      });
      m.userData.tile = d[1];
      W.mats[k] = m;
    }
    // overlays that sit on the terrain get polygon offset against it
    W.mats.paver.polygonOffset = true; W.mats.paver.polygonOffsetFactor = -2; W.mats.paver.polygonOffsetUnits = -2;
    W.mats.marble.polygonOffset = true; W.mats.marble.polygonOffsetFactor = -2; W.mats.marble.polygonOffsetUnits = -2;
    W.mats.carpet.polygonOffset = true; W.mats.carpet.polygonOffsetFactor = -3; W.mats.carpet.polygonOffsetUnits = -3;
    W.mats.wood.polygonOffset = true; W.mats.wood.polygonOffsetFactor = -1; W.mats.wood.polygonOffsetUnits = -1;
    W.mats.glass = new THREE.MeshPhongMaterial({
      color: 0xa4d6f2, transparent: true, opacity: 0.3, shininess: 160,
      specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false
    });
    W.mats.glass.userData.tile = 1;
    W.mats.trim = stdMat(0x3a3a3f, 0.55, 0.3);
    W.mats.red = stdMat(0x9c2b2b, 0.8, 0);
    W.mats.bone = stdMat(0xe8e2cf, 0.7, 0);
    W.mats.stone = stdMat(0x9a9a98, 0.9, 0);
    W.mats.black = stdMat(0x1b1b1e, 0.6, 0.2);
    W.mats.green = stdMat(0x2f5e3a, 0.8, 0);
    W.mats.frame = stdMat(0xe9e4d8, 0.7, 0);
    W.mats.darkframe = stdMat(0x2a2623, 0.6, 0.1);
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1c4 }); lamp.userData.tile = 1; W.mats.lamp = lamp;
    W._texCache = texCache;

    // terrain splat textures (linear bytes, decoded in the shader) + bump + grass blade
    function lin(size, fn) { const t = mkTex(size, fn, false); return t; }
    W._tSand = lin(256, TEXN.sandT); W._tGrass = lin(256, TEXN.grassT); W._tRock = lin(256, TEXN.rockT);
    W._terrTex = lin(128, TEXN.bumpT);
    W._terrBump = W._terrTex;
    W._grassBlade = mkTex(64, TEXN.blade);
    W._roadTex = mkTex(256, TEX.road);
    W._roadBump = mkTex(128, TEXN.bumpT, false);
  }

  // ---------------------------------------------------------------- batched static geometry
  function Batch() { this.g = {}; }
  Batch.prototype.group = function (mat) {
    let g = this.g[mat];
    if (!g) g = this.g[mat] = { p: [], n: [], u: [], i: [], tile: (W.mats[mat].userData.tile || 2) };
    return g;
  };
  function pushQuad(g, a, b, c, d, nx, ny, nz, ua, va) {
    const base = g.p.length / 3, t = 1 / g.tile;
    const vs = [a, b, c, d];
    for (let k = 0; k < 4; k++) {
      const v = vs[k];
      g.p.push(v[0], v[1], v[2]); g.n.push(nx, ny, nz);
      g.u.push(v[ua] * t, v[va] * t);
    }
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  Batch.prototype.box = function (mat, x0, y0, z0, x1, y1, z1) {
    const g = this.group(mat);
    pushQuad(g, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, 2, 1);
    pushQuad(g, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, 2, 1);
    pushQuad(g, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, 0, 2);
    pushQuad(g, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, 0, 2);
    pushQuad(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, 0, 1);
    pushQuad(g, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, 0, 1);
  };
  /** Free quad a,b,c,d (arrays [x,y,z]), counter-clockwise seen from the front. */
  Batch.prototype.quad = function (mat, a, b, c, d) {
    const g = this.group(mat), t = 1 / g.tile;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
    const lu = Math.sqrt(ux * ux + uy * uy + uz * uz) * t, lv = Math.sqrt(vx * vx + vy * vy + vz * vz) * t;
    const base = g.p.length / 3;
    const vs = [a, b, c, d], uvs = [[0, 0], [lu, 0], [lu, lv], [0, lv]];
    for (let k = 0; k < 4; k++) {
      g.p.push(vs[k][0], vs[k][1], vs[k][2]); g.n.push(nx, ny, nz); g.u.push(uvs[k][0], uvs[k][1]);
    }
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  Batch.prototype.tri = function (mat, a, b, c) {
    const g = this.group(mat), t = 1 / g.tile;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
    const base = g.p.length / 3;
    const vs = [a, b, c];
    for (let k = 0; k < 3; k++) {
      g.p.push(vs[k][0], vs[k][1], vs[k][2]); g.n.push(nx, ny, nz);
      g.u.push((Math.abs(nx) > 0.5 ? vs[k][2] : vs[k][0]) * t, vs[k][1] * t);
    }
    g.i.push(base, base + 1, base + 2);
  };
  Batch.prototype.build = function (parent) {
    for (const k in this.g) {
      const g = this.g[k];
      if (!g.i.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
      geo.setIndex(g.p.length / 3 > 65000 ? new THREE.Uint32BufferAttribute(g.i, 1) : new THREE.Uint16BufferAttribute(g.i, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, W.mats[k]);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = !W.mats[k].transparent; mesh.receiveShadow = !W.mats[k].transparent;
      parent.add(mesh);
    }
    this.g = {};
  };
  W.Batch = Batch;

  // ---------------------------------------------------------------- minimap helpers
  let mmCtx = null;
  function mx(x) { return (x + SIZE) / (2 * SIZE) * 512; }
  function mz(z) { return (z + SIZE) / (2 * SIZE) * 512; }
  W.mapRect = function (x0, z0, x1, z1, fill, stroke) {
    if (!mmCtx) return;
    const a = mx(x0), b = mz(z0), w = mx(x1) - a, h = mz(z1) - b;
    if (fill) { mmCtx.fillStyle = fill; mmCtx.fillRect(a, b, w, h); }
    if (stroke) { mmCtx.strokeStyle = stroke; mmCtx.lineWidth = 1; mmCtx.strokeRect(a, b, w, h); }
  };
  W.mapDot = function (x, z, r, fill) {
    if (!mmCtx) return;
    mmCtx.fillStyle = fill; mmCtx.beginPath(); mmCtx.arc(mx(x), mz(z), r, 0, 6.3); mmCtx.fill();
  };

  function paintMinimap() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const img = g.createImageData(512, 512), d = img.data;
    for (let j = 0; j < 512; j++) {
      for (let i = 0; i < 512; i++) {
        const x = (i + 0.5) / 512 * 2 * SIZE - SIZE, z = (j + 0.5) / 512 * 2 * SIZE - SIZE;
        const h = heightAt(x, z);
        let r, gg, b;
        if (h < -5) { r = 22; gg = 62; b = 112; }
        else if (h < -0.6) { r = 38; gg = 100; b = 156; }
        else if (h < 0) { r = 70; gg = 140; b = 190; }
        else if (h < 0.5) { r = 224; gg = 208; b = 150; }
        else if (h > 5) { r = 118; gg = 118; b = 112; }
        else { const v = (Math.sin(x * 0.2) * Math.cos(z * 0.2)) * 6; r = 92 + v; gg = 150 + v; b = 82 + v; }
        const o = (j * 512 + i) * 4;
        d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    W.minimapCanvas = c;
    mmCtx = g;
  }

  // ---------------------------------------------------------------- scenery
  const HORIZON_HEX = 0xbfd9ee, TOP_HEX = 0x2d6fd2;
  const SUN_DIR = new THREE.Vector3(0.5, 0.55, 0.35).normalize();
  let skyGroup = null, sunL = null, waterU = null, clouds = [];
  const NATURE = {"trees":[[67.65,-143.93,1.089,1,1.206],[-28.07,-157.77,7.006,0,1.317],[122.9,-10.91,1.985,0,1.398],[-89.36,-106.99,2.086,0,1.308],[-148.92,-32.21,2.12,0,0.929],[83.3,159.46,0.97,1,1.196],[-80.56,114.69,2.192,0,1.312],[-114.57,63.65,1.972,0,1.278],[-22.53,152.08,1.017,1,0.81],[-14.72,149.6,0.741,1,1.363],[101.13,-138.43,2.645,0,1.01],[126.4,30.14,1.981,0,1.089],[-33.46,-134.16,2.545,0,1.136],[134.69,-2.65,1.759,0,1.031],[120.1,22.1,1.992,0,1.203],[15.35,-166.57,1.829,0,0.929],[-106.7,127.95,1.044,1,0.981],[-71.33,99.56,2.001,0,1.358],[-122.55,27.91,2.007,0,0.936],[-70.02,162.31,1.854,0,1.377],[123.31,77.88,1.184,0,1.127],[158.42,30.84,3.352,0,1.331],[-141.85,39.55,1.61,0,0.911],[129.16,80.07,1.074,1,0.895],[-89.02,-88.85,1.947,0,0.927],[-147.51,27.13,1.571,0,1.27],[-109.83,-77.29,1.847,0,1.006],[29.04,-164.62,1.209,0,1.178],[76.59,154.19,3.803,0,1.124],[-142.58,-39.62,1.76,0,1.101],[84.09,122.45,1.123,0,1.004],[176.6,8.91,3.821,0,1.28],[-158.03,-4.95,7.795,0,1.255],[-27.78,137.75,1.838,0,1.292],[-129.02,47.75,1.993,0,1.302],[-54.9,-109.22,1.994,0,1.346],[-55.67,159.21,1.324,0,0.989],[-43.57,162.42,1.052,1,1.259],[71.66,113.08,1.912,0,1.069],[19.44,-141.97,1.804,0,0.949],[182.27,-11.4,0.522,1,1.302],[-38.59,-140.49,2.924,0,0.969],[-46.24,-119.19,1.912,0,1.238],[35.94,132.18,1.639,0,1.224],[125.72,75.85,1.184,0,0.978],[77.98,-123.59,1.586,0,0.941],[134.49,53.89,1.612,0,0.993],[99.09,82.76,2.004,0,1.19],[-117.19,117.25,1.204,0,1.069],[-45.26,163.74,0.963,1,1.087],[-97.61,-135.08,0.463,1,1.015],[-149.57,77.21,0.374,1,0.856],[-18.32,124.34,1.974,0,1.382],[-0.16,-167.32,5.328,0,1.15],[-21.23,-170.98,6.163,0,0.864],[-42.52,-116.99,1.959,0,1.077],[110.82,-80.16,1.787,0,1.105],[72.51,150.09,4.097,0,1.177],[-55.61,110.49,1.967,0,1.146],[18.2,128.3,1.93,0,1.164],[8.85,-124.98,2,0,1.057],[3.3,-132.87,2.37,0,1.087],[-38.18,-177.51,0.869,1,1.05],[-131.22,-18.45,1.954,0,1.052],[-90.92,86.72,2.017,0,1.35],[-138.89,-83.4,0.829,1,0.988],[-57.22,-109.99,1.982,0,1.261],[74.37,103.2,1.985,0,1.383],[32.25,-156.32,1.107,0,0.926],[-93.03,115.21,1.709,0,1.335],[154.51,2.72,5.986,0,1.065],[-72.89,135.86,3.67,0,1.373],[123.35,17.27,1.966,0,1.395],[-117.38,89.8,0.959,1,0.892],[150.48,40.37,1.879,0,1.269],[-1.38,144.43,0.927,1,1.37],[-7.76,133.86,1.66,0,0.948],[79.17,135.42,1.26,0,0.921],[-56.82,-120.53,1.724,0,0.839],[-63.19,-158.12,0.769,1,1.1],[178.59,-21.82,0.615,1,1.123],[86.06,-97.81,2.028,0,1.342],[-71.86,114.12,2.003,0,0.919],[-3.15,164.22,0.403,1,0.865],[148.08,-75.73,0.804,1,0.904],[140.39,22.77,2.833,0,1.201],[122.55,-39.54,1.932,0,0.834],[101.26,-68.69,1.991,0,1.253],[131.53,60.7,1.461,0,1.364],[-86.66,-96.87,1.92,0,0.935],[-139.43,32.15,1.663,0,0.807],[-157.54,15.39,3.615,0,1.388],[-45.02,157.13,1.221,0,0.836],[-137.52,-66.11,1.399,0,0.911],[84.15,143.22,1.564,0,0.881],[-53.71,-122.59,1.716,0,1.047],[81.16,141.71,1.757,0,0.942],[156.48,-63.09,0.527,1,1.231],[143.36,-35.83,1.652,0,1.379],[41.63,118.32,1.943,0,0.883],[71.1,114.1,1.898,0,1.116],[86.5,-104.3,2.063,0,0.904],[-37.38,-131.97,2.199,0,0.922],[-22.73,-164.46,8.001,0,0.986],[-114.1,107.02,1.319,0,0.827],[150.89,6.07,5.462,0,1.256],[113.81,66.84,1.856,0,0.959],[17.1,-128.72,1.921,0,1.301],[-31.25,157.84,1.077,1,1.169],[159.5,-35.27,0.74,1,1.11]],"rocks":[[-119.01,72.34,1.812,1.505],[-83.68,109.37,2.011,2.211],[-61.34,-155.64,1.137,1.859],[-122.93,-30.06,1.96,2.431],[177.55,-1.16,2.643,2.384],[-150.05,-23.48,3.466,2.132],[123.35,69.18,1.368,2.055],[-102.04,-138.63,0.462,0.916],[-89.8,-100.84,1.969,1.444],[174.16,44.66,0.248,1.834],[185.82,7.04,0.298,2.008],[-98.76,100.04,2.013,1.586],[-53.13,-121.69,1.763,2.424],[181.04,7.52,1.573,2.303],[121.54,39.12,1.987,2.499],[89.48,-105.55,2.083,2.129],[-106.7,-87.81,1.834,1.966],[160.85,-32.63,0.67,2.332],[-48.62,-136.12,1.628,2.069],[17.23,-147.84,2.238,1.023],[-89.7,-123.44,1.488,0.928],[-97.55,-110.77,1.74,1.249],[59.01,164.71,2.632,1.332],[83.86,-161.94,0.355,1.259],[-108.8,-78.44,1.84,1.605],[65.12,-111.16,1.883,1.835],[-53.41,-175.63,0.251,1.906],[95.64,135.45,0.524,1.131],[77.83,-103.86,1.928,1.524],[115.4,61.43,1.915,1.068],[-128.65,-85.34,0.857,1.459],[-51.87,137.01,2.137,1.892],[-22.37,-170.71,6.108,1.84],[-132.8,-69.21,1.626,2.115]]};

  function gfxLow() { return !!(COD.config && COD.config.gfx === 'low'); }

  function softPuffTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ---- terrain: splat (sand / grass / rock) by vertex weights, two-scale sampling, bump
  function buildTerrain(scene) {
    const SEG = 320, S = SIZE * 2;
    const geo = new THREE.PlaneGeometry(S, S, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      uv.setXY(i, x / 8, -z / 8);
      const sl = Math.abs(heightAt(x + 2, z) - h) + Math.abs(heightAt(x, z + 2) - h);
      const n = 0.5 + 0.5 * Math.sin(x * 0.13 + Math.sin(z * 0.09) * 2.0) * Math.cos(z * 0.11 + x * 0.04);
      let ws = 1 - smooth(0.6 + n * 0.3, 1.5 + n * 0.4, h);      // sand on beaches and sea floor
      if (h < 0) ws = 1;
      let wr = 0;
      if (h > PL + 1.2 || sl > 1.4) wr = Math.max(smooth(PL + 1.2, PL + 6, h), smooth(1.2, 3.2, sl));
      wr *= (1 - ws);
      const wg = Math.max(0, 1 - ws - wr);
      col[i * 3] = ws; col[i * 3 + 1] = wg; col[i * 3 + 2] = wr;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      map: W._terrTex, vertexColors: true, roughness: 1, metalness: 0, bumpMap: W._terrBump, bumpScale: 1.4
    });
    m.onBeforeCompile = function (shader) {
      shader.uniforms.tSand = { value: W._tSand };
      shader.uniforms.tGrass = { value: W._tGrass };
      shader.uniforms.tRock = { value: W._tRock };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tSand;\nuniform sampler2D tGrass;\nuniform sampler2D tRock;')
        .replace('#include <color_fragment>', '')
        .replace('#include <map_fragment>', [
          'vec2 uA = vUv; vec2 uB = vUv * 0.41 + vec2(0.37, 0.11); vec2 uC = vUv * 3.1;',
          'vec3 sand = mix(texture2D(tSand, uA).rgb, texture2D(tSand, uB).rgb, 0.3);',
          'vec3 grass = mix(texture2D(tGrass, uA).rgb, texture2D(tGrass, uB).rgb, 0.4);',
          'vec3 rock = mix(texture2D(tRock, uA).rgb, texture2D(tRock, uB).rgb, 0.5);',
          'vec3 wgt = vColor.rgb;',
          'vec3 tc = sand * wgt.r + grass * wgt.g + rock * wgt.b;',
          'float det = texture2D(tGrass, uC).g * 1.2 + 0.2;',
          'float macro = 0.82 + 0.36 * (0.5 + 0.5 * sin(vUv.x * 0.7 + sin(vUv.y * 0.45) * 1.7) * cos(vUv.y * 0.6));',
          'tc = pow(tc, vec3(2.2)) * det * macro;',
          'diffuseColor.rgb = tc;'
        ].join('\n'));
    };
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'terrain';
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---- water: waves, fresnel, sparkle, depth colour, shore foam
  function buildDepthTex() {
    const N = 512, data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N * 520 - 260, z = (j + 0.5) / N * 520 - 260;
        let d = -heightAt(x, z);
        d = d < -1 ? -1 : (d > 3 ? 3 : d);
        const v = (d + 1) / 4 * 255;
        const o = (j * N + i) * 4;
        data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }

  const WATER_VS = [
    'uniform float time; uniform sampler2D tDepth;',
    'varying vec3 vWorld;',
    '#include <fog_pars_vertex>',
    'float waveH(vec2 p, float t) {',
    '  return 0.10 * sin(dot(p, vec2(0.070, 0.040)) + t * 1.1) + 0.07 * sin(dot(p, vec2(-0.050, 0.090)) + t * 1.4)',
    '       + 0.05 * sin(dot(p, vec2(0.150, -0.110)) + t * 1.9) + 0.03 * sin(dot(p, vec2(0.300, 0.220)) + t * 2.6);',
    '}',
    'void main() {',
    '  vec3 p = position;',
    '  float depth = texture2D(tDepth, (p.xz + 260.0) / 520.0).r * 4.0 - 1.0;',
    '  float k = smoothstep(0.0, 1.4, depth);',
    '  p.y += waveH(p.xz, time) * k;',
    '  vWorld = p;',
    '  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}'
  ].join('\n');

  const WATER_FS = [
    'uniform float time; uniform sampler2D tDepth;',
    'uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 shallowC; uniform vec3 deepC; uniform vec3 deepestC;',
    'uniform vec3 skyH; uniform vec3 skyT;',
    'varying vec3 vWorld;',
    '#include <fog_pars_fragment>',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'void main() {',
    '  vec2 uv = (vWorld.xz + 260.0) / 520.0;',
    '  float depth = texture2D(tDepth, uv).r * 4.0 - 1.0;',
    '  if (depth < -0.03) discard;',
    '  vec2 p = vWorld.xz;',
    '  float gx = 0.10 * 0.070 * cos(dot(p, vec2(0.070, 0.040)) + time * 1.1) + 0.07 * -0.050 * cos(dot(p, vec2(-0.050, 0.090)) + time * 1.4)',
    '           + 0.05 * 0.150 * cos(dot(p, vec2(0.150, -0.110)) + time * 1.9) + 0.03 * 0.300 * cos(dot(p, vec2(0.300, 0.220)) + time * 2.6);',
    '  float gz = 0.10 * 0.040 * cos(dot(p, vec2(0.070, 0.040)) + time * 1.1) + 0.07 * 0.090 * cos(dot(p, vec2(-0.050, 0.090)) + time * 1.4)',
    '           + 0.05 * -0.110 * cos(dot(p, vec2(0.150, -0.110)) + time * 1.9) + 0.03 * 0.220 * cos(dot(p, vec2(0.300, 0.220)) + time * 2.6);',
    '  float r1 = vnoise(p * 1.7 + vec2(time * 0.6, time * 0.3)) - 0.5, r2 = vnoise(p * 2.3 - vec2(time * 0.4, time * 0.7)) - 0.5;',
    '  vec3 N = normalize(vec3(-(gx * 3.0 + r1 * 0.14), 1.0, -(gz * 3.0 + r2 * 0.14)));',
    '  vec3 V = normalize(cameraPosition - vWorld);',
    '  float fres = 0.03 + 0.8 * pow(1.0 - max(dot(N, V), 0.0), 4.5);',
    '  float dk = clamp(depth / 3.0, 0.0, 1.0);',
    '  vec3 base = mix(shallowC, deepC, smoothstep(0.0, 0.85, dk));',
    '  base = mix(base, deepestC, smoothstep(215.0, 520.0, length(vWorld.xz)));',
    '  vec3 R = reflect(-V, N);',
    '  vec3 sky = mix(skyH, skyT, pow(clamp(R.y, 0.0, 1.0), 0.5));',
    '  vec3 col = mix(base, sky, fres);',
    '  float spec = pow(max(dot(R, sunDir), 0.0), 220.0) * 2.5 + pow(max(dot(R, sunDir), 0.0), 18.0) * 0.12;',
    '  col += sunColor * spec * (0.5 + 0.9 * vnoise(p * 1.5 + time));',
    '  float wob = 0.12 * sin(p.x * 0.35 + time * 0.8) + 0.10 * sin(p.y * 0.4 - time * 0.7);',
    '  float dd = depth + wob * smoothstep(0.0, 0.5, depth);',
    '  float band = 1.0 - smoothstep(0.05, 0.75, dd);',
    '  float stripes = smoothstep(0.25, 0.6, sin(dd * 16.0 - time * 1.6 + vnoise(p * 0.8) * 5.0) * 0.5 + 0.5);',
    '  float foam = band * (0.35 + 0.65 * stripes) + (1.0 - smoothstep(0.0, 0.1, dd)) * 0.9;',
    '  foam *= 0.55 + 0.45 * vnoise(p * 2.0 + time * 0.2);',
    '  foam = clamp(foam, 0.0, 1.0);',
    '  col = mix(col, vec3(0.95, 0.97, 1.0), foam * 0.85);',
    '  float alpha = mix(0.50, 0.96, smoothstep(0.0, 0.9, dk));',
    '  alpha = max(max(alpha, fres * 0.95), foam);',
    '  gl_FragColor = vec4(col, alpha);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '  #include <fog_fragment>',
    '}'
  ].join('\n');

  function oceanGeometry() {
    const radii = [0, 40, 80];
    for (let r = 100; r <= 300; r += 5) radii.push(r);
    for (let k = 1; k <= 38; k++) radii.push(300 + 1200 * Math.pow(k / 38, 1.8));
    const SEGS = 160, pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let i = 1; i < radii.length; i++) {
      for (let s = 0; s < SEGS; s++) {
        const a = s / SEGS * Math.PI * 2;
        pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
      }
    }
    for (let s = 0; s < SEGS; s++) idx.push(0, 1 + (s + 1) % SEGS, 1 + s);
    for (let i = 1; i < radii.length - 1; i++) {
      const a0 = 1 + (i - 1) * SEGS, a1 = 1 + i * SEGS;
      for (let s = 0; s < SEGS; s++) {
        const n = (s + 1) % SEGS;
        idx.push(a0 + s, a0 + n, a1 + s, a0 + n, a1 + n, a1 + s);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  function buildOcean(scene) {
    const depthTex = buildDepthTex();
    const U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, tDepth: { value: depthTex },
      sunDir: { value: SUN_DIR.clone() }, sunColor: { value: new THREE.Color(1.0, 0.92, 0.75) },
      shallowC: { value: new THREE.Color(0x2fc4bd) }, deepC: { value: new THREE.Color(0x0b5d99) },
      deepestC: { value: new THREE.Color(0x06305e) },
      skyH: { value: new THREE.Color(HORIZON_HEX) }, skyT: { value: new THREE.Color(TOP_HEX) }
    }]);
    waterU = U;
    const m = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: WATER_VS, fragmentShader: WATER_FS,
      transparent: true, depthWrite: false, fog: true
    });
    const ocean = new THREE.Mesh(oceanGeometry(), m);
    ocean.frustumCulled = false;
    ocean.renderOrder = 2;
    ocean.name = 'ocean';
    scene.add(ocean);
    // deep floor so there is never a void under the transparent water
    const fl = new THREE.Mesh(new THREE.CircleGeometry(1600, 24), new THREE.MeshBasicMaterial({ color: 0x063b66 }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = -30; fl.frustumCulled = false;
    scene.add(fl);
  }

  // ---- sky dome shader, sun disc + glow, soft sprite clouds, lights, fog
  const SKY_VS = 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const SKY_FS = [
    'uniform vec3 topC; uniform vec3 horC; uniform vec3 groundC; uniform vec3 sunDir;',
    'varying vec3 vDir;',
    'void main() {',
    '  vec3 d = normalize(vDir);',
    '  float h = d.y;',
    '  vec3 col = mix(horC, topC, pow(clamp(h, 0.0, 1.0), 0.42));',
    '  col += horC * 0.18 * exp(-max(h, 0.0) * 9.0);',
    '  col = mix(col, groundC, smoothstep(0.0, -0.18, h));',
    '  float s = max(dot(d, sunDir), 0.0);',
    '  col += vec3(1.0, 0.82, 0.55) * (pow(s, 5.0) * 0.16 + pow(s, 60.0) * 0.55);',
    '  col = mix(col, vec3(4.0, 3.6, 2.8), smoothstep(0.99935, 0.99965, s));',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');

  function buildSky(scene) {
    const geo = new THREE.SphereGeometry(900, 32, 20);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        topC: { value: new THREE.Color(TOP_HEX) }, horC: { value: new THREE.Color(HORIZON_HEX) },
        groundC: { value: new THREE.Color(0x9fbad0) }, sunDir: { value: SUN_DIR.clone() }
      },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false
    });
    skyGroup = new THREE.Group();
    const dome = new THREE.Mesh(geo, m);
    dome.renderOrder = -10; dome.frustumCulled = false;
    skyGroup.add(dome);
    scene.add(skyGroup);
    // clouds: clusters of soft sprites
    const tex = softPuffTex();
    const mWhite = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
    const mGrey = new THREE.SpriteMaterial({ map: tex, color: 0xc4d2e4, transparent: true, opacity: 0.75, depthWrite: false, fog: false });
    const cr = mulberry32(2024);
    for (let i = 0; i < 18; i++) {
      const grp = new THREE.Group();
      const n = 6 + ((cr() * 5) | 0);
      for (let k = 0; k < n; k++) {
        const low = k < 2;
        const sp = new THREE.Sprite(low ? mGrey : mWhite);
        const sc = 60 + cr() * 70;
        sp.scale.set(sc * 1.5, sc * 0.7, 1);
        sp.position.set((k - n / 2) * 32 + cr() * 20, (low ? -6 : 3 + cr() * 8), cr() * 40 - 20);
        grp.add(sp);
      }
      const a = cr() * Math.PI * 2, r = 150 + cr() * 650;
      grp.position.set(Math.cos(a) * r, 190 + cr() * 100, Math.sin(a) * r);
      scene.add(grp);
      clouds.push(grp);
    }
    scene.fog = new THREE.Fog(HORIZON_HEX, 320, 1350);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x9a948a, 0.8));
    sunL = new THREE.DirectionalLight(0xfff0d4, 1.55);
    sunL.position.copy(SUN_DIR).multiplyScalar(220);
    scene.add(sunL, sunL.target);
    if (!gfxLow()) {
      sunL.castShadow = true;
      sunL.shadow.mapSize.set(2048, 2048);
      const c = sunL.shadow.camera;
      c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 10; c.far = 480;
      sunL.shadow.bias = -0.0005;
      sunL.shadow.normalBias = 0.05;
      c.updateProjectionMatrix();
    }
  }

  const _sr = new THREE.Vector3(), _su = new THREE.Vector3(), _sp = new THREE.Vector3();
  function updateSun() {
    if (!sunL || !sunL.castShadow) return;
    const p = (COD.player && COD.player.pos) || (COD.camera && COD.camera.position);
    if (!p) return;
    const TEX_STEP = 120 / 2048;
    _sr.crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    _su.crossVectors(SUN_DIR, _sr).normalize();
    const a = Math.round(p.dot(_sr) / TEX_STEP) * TEX_STEP, b = Math.round(p.dot(_su) / TEX_STEP) * TEX_STEP, c = p.dot(SUN_DIR);
    _sp.set(0, 0, 0).addScaledVector(_sr, a).addScaledVector(_su, b).addScaledVector(SUN_DIR, c);
    sunL.target.position.copy(_sp);
    sunL.position.copy(_sp).addScaledVector(SUN_DIR, 220);
    sunL.target.updateMatrixWorld();
  }

  // ---- vegetation (merged, vertex-coloured, instanced)
  function GeoAcc() { this.p = []; this.c = []; this.i = []; }
  GeoAcc.prototype.add = function (g, m, colorFn) {
    g = g.index ? g : g;
    g.applyMatrix4(m);
    const pos = g.attributes.position, base = this.p.length / 3, col = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      this.p.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      colorFn(col, pos.getX(k), pos.getY(k), pos.getZ(k), k);
      this.c.push(col.r, col.g, col.b);
    }
    if (g.index) { for (let k = 0; k < g.index.count; k++) this.i.push(base + g.index.getX(k)); }
    else { for (let k = 0; k < pos.count; k++) this.i.push(base + k); }
  };
  GeoAcc.prototype.build = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeVertexNormals();
    return g;
  };
  function mat4(x, y, z, sx, sy, sz, rx, ry, rz) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(sx, sy, sz));
    return m;
  }

  function palmGeometry() {
    const A = new GeoAcc(), H = 4.6, bend = 0.9;
    const col = function (hex, k) { return function (c, x, y) { c.set(hex); const s = 0.8 + 0.2 * Math.sin(y * 9.0); c.multiplyScalar(s * k); }; };
    // curved trunk from stacked tapered segments
    const N = 7;
    for (let s = 0; s < N; s++) {
      const t0 = s / N, t1 = (s + 1) / N;
      const x0 = bend * t0 * t0, x1 = bend * t1 * t1;
      const r0 = 0.26 - 0.12 * t0, r1 = 0.26 - 0.12 * t1;
      const cg = new THREE.CylinderGeometry(r1, r0, H / N * 1.04, 7, 1, true);
      const ang = Math.atan2(x1 - x0, H / N);
      A.add(cg, mat4((x0 + x1) / 2, (t0 + t1) / 2 * H, 0, 1, 1, 1, 0, 0, -ang), col(0x7a5a38, 1));
    }
    // fronds: arched, tapered strips
    const F = 9, topX = bend, topY = H;
    for (let f = 0; f < F; f++) {
      const a = f / F * Math.PI * 2 + 0.3 * (f % 2), L = 2.5 + 0.5 * ((f * 7) % 3) / 2;
      const segs = 7, pos = [], idx = [];
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        const along = u * L, drop = -1.35 * u * u + 0.55 * Math.sin(u * 2.4);
        const w = 0.42 * Math.sin(Math.PI * (0.08 + 0.92 * u)) + 0.02;
        const cx = Math.cos(a), cz = Math.sin(a);
        const bx = cx * along, bz = cz * along;
        pos.push(bx - cz * w, drop, bz + cx * w, bx + cz * w, drop, bz - cx * w);
        if (s < segs) { const k = s * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      A.add(g, mat4(topX, topY, 0, 1, 1, 1), function (c, x, y, z) {
        c.set(0x3f8a34); c.offsetHSL((Math.sin(f * 3.1) * 0.02), 0, 0.12 * (y + 1.2) / 2.0 - 0.06);
      });
    }
    // coconuts
    A.add(new THREE.IcosahedronGeometry(0.16, 0), mat4(topX + 0.15, topY - 0.15, 0.1, 1, 1, 1), col(0x4a3418, 1));
    return A.build();
  }

  function broadGeometry() {
    const A = new GeoAcc();
    A.add(new THREE.CylinderGeometry(0.18, 0.3, 3.0, 7), mat4(0, 1.5, 0, 1, 1, 1), function (c, x, y) { c.set(0x6b4a2a); c.multiplyScalar(0.8 + 0.2 * Math.sin(y * 7)); });
    const blobs = [[0, 3.6, 0, 1.7], [1.1, 3.0, 0.4, 1.2], [-1.0, 3.2, -0.5, 1.25], [0.2, 4.5, 0.2, 1.1], [-0.4, 2.9, 1.0, 1.0]];
    blobs.forEach(function (b, bi) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const j = 0.82 + 0.3 * Math.abs(Math.sin(p.getX(k) * 5.1 + p.getY(k) * 3.7 + p.getZ(k) * 4.3 + bi));
        p.setXYZ(k, p.getX(k) * j, p.getY(k) * j, p.getZ(k) * j);
      }
      A.add(g, mat4(b[0], b[1], b[2], b[3], b[3] * 0.85, b[3], 0, bi, 0), function (c, x, y) {
        c.set(0x3d7d33); c.offsetHSL((bi - 2) * 0.012, 0, (y - b[1]) * 0.05 - 0.02);
      });
    });
    return A.build();
  }

  function coniferGeometry() {
    const A = new GeoAcc();
    A.add(new THREE.CylinderGeometry(0.15, 0.25, 1.6, 6), mat4(0, 0.8, 0, 1, 1, 1), function (c) { c.set(0x5a3e24); });
    const tiers = [[1.9, 1.7, 1.2], [1.5, 1.6, 2.4], [1.1, 1.5, 3.5], [0.7, 1.3, 4.5]];
    tiers.forEach(function (t, k) {
      A.add(new THREE.ConeGeometry(t[0], t[1], 8), mat4(0, t[2], 0, 1, 1, 1, 0, k, 0), function (c, x, y) {
        c.set(0x24582b); c.offsetHSL(0, 0, (y - t[2]) * 0.05);
      });
    });
    return A.build();
  }

  function rockGeometry() {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const j = 0.78 + 0.4 * Math.abs(Math.sin(x * 4.3 + y * 2.9 + z * 5.7));
      p.setXYZ(k, x * j, y * j * 0.8, z * j);
    }
    g.computeVertexNormals();
    return g;
  }

  function buildNature(scene) {
    const dm = new THREE.Object3D(), tint = new THREE.Color();
    const list = NATURE.trees, rocks = NATURE.rocks;
    const palms = [], broads = [], conifers = [];
    for (let i = 0; i < list.length; i++) {
      const t = { x: list[i][0], z: list[i][1], y: list[i][2], palm: list[i][3] === 1, s: list[i][4] };
      if (t.palm) palms.push(t); else if (t.y > 3.4) conifers.push(t); else broads.push(t);
      W.box(t.x - 0.3, t.y - 0.5, t.z - 0.3, t.x + 0.3, t.y + 3, t.z + 0.3, 'solid', 'tree');
    }
    const foliageM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    function make(geo, arr, scaleFn, hueJit) {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(geo, foliageM, arr.length);
      const rr = mulberry32(arr.length * 31 + 7);
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i], s = t.s;
        dm.position.set(t.x, t.y - 0.1, t.z);
        dm.rotation.set(0, rr() * 6.28, 0);
        const sc = scaleFn(s);
        dm.scale.set(sc[0], sc[1], sc[2]);
        dm.updateMatrix(); im.setMatrixAt(i, dm.matrix);
        tint.setHSL(0.27 + (rr() - 0.5) * hueJit, 0.0, 0.0); // placeholder, overwritten below
        const v = 0.85 + rr() * 0.3;
        tint.setRGB(v, v * (0.92 + rr() * 0.16), v * (0.85 + rr() * 0.2));
        im.setColorAt(i, tint);
      }
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      scene.add(im);
    }
    make(palmGeometry(), palms, function (s) { return [s, s, s]; }, 0.04);
    make(broadGeometry(), broads, function (s) { return [s * 0.95, s * 0.95, s * 0.95]; }, 0.06);
    make(coniferGeometry(), conifers, function (s) { return [s * 1.0, s * 1.15, s * 1.0]; }, 0.03);

    // rocks
    const rm = new THREE.MeshStandardMaterial({ map: W.mats.rock.map, bumpMap: W.mats.rock.map, bumpScale: 2, roughness: 0.95, metalness: 0, flatShading: true });
    const iRock = new THREE.InstancedMesh(rockGeometry(), rm, rocks.length);
    const rr = mulberry32(555);
    for (let i = 0; i < rocks.length; i++) {
      const k = { x: rocks[i][0], z: rocks[i][1], y: rocks[i][2], s: rocks[i][3] };
      dm.position.set(k.x, k.y + k.s * 0.35, k.z); dm.rotation.set(rr() * 0.5, rr() * 6.28, rr() * 0.5);
      dm.scale.set(k.s * 1.25, k.s * 0.95, k.s); dm.updateMatrix(); iRock.setMatrixAt(i, dm.matrix);
      const v = 0.7 + rr() * 0.5; tint.setRGB(v, v * (0.95 + rr() * 0.08), v * (0.9 + rr() * 0.1)); iRock.setColorAt(i, tint);
      const e = k.s * 0.75;
      W.box(k.x - e, k.y - 0.3, k.z - e, k.x + e, k.y + k.s * 0.9, k.z + e, 'solid', 'rock');
      W.coverPoints.push(new THREE.Vector3(k.x + e + 0.8, groundAt(k.x + e + 0.8, k.z), k.z));
      W.coverPoints.push(new THREE.Vector3(k.x - e - 0.8, groundAt(k.x - e - 0.8, k.z), k.z));
    }
    iRock.castShadow = true; iRock.receiveShadow = true; iRock.frustumCulled = false;
    scene.add(iRock);

    // bushes (visual only)
    const br = mulberry32(8080), bushes = [];
    let guard = 0;
    while (bushes.length < 120 && guard++ < 4000) {
      const a = br() * Math.PI * 2, r = 110 + br() * 78;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
      if (h < 0.7) continue;
      if (W.teamSpawns.some(function (s) { return Math.hypot(s.to.x - x, s.to.z - z) < 20; })) continue;
      if (x > 8 && x < 55 && z > 140) continue;
      bushes.push([x, h, z, 0.7 + br() * 0.7]);
    }
    const bg = new THREE.IcosahedronGeometry(1, 1);
    const bp = bg.attributes.position;
    for (let k = 0; k < bp.count; k++) {
      const j = 0.85 + 0.25 * Math.abs(Math.sin(bp.getX(k) * 6 + bp.getZ(k) * 4));
      bp.setXYZ(k, bp.getX(k) * j, bp.getY(k) * j * 0.7, bp.getZ(k) * j);
    }
    bg.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ map: W.mats.leaf.map, roughness: 0.9, metalness: 0, flatShading: true });
    const iBush = new THREE.InstancedMesh(bg, bm, bushes.length);
    for (let i = 0; i < bushes.length; i++) {
      const b = bushes[i];
      dm.position.set(b[0], b[1] + b[3] * 0.3, b[2]); dm.rotation.set(0, br() * 6, 0); dm.scale.set(b[3], b[3], b[3] * 1.1);
      dm.updateMatrix(); iBush.setMatrixAt(i, dm.matrix);
      tint.setHSL(0.24 + br() * 0.08, 0.5, 0.35 + br() * 0.15); iBush.setColorAt(i, tint);
    }
    iBush.castShadow = true; iBush.receiveShadow = true; iBush.frustumCulled = false;
    scene.add(iBush);

    for (let i = 0; i < list.length; i++) W.mapDot(list[i][0], list[i][1], 1.4, list[i][3] ? '#3e8f3a' : '#2f6e2c');
  }

  /** Instanced grass tufts. ok(x,z) lets buildings.js reject roads / buildings. Call once after colliders exist. */
  W.addGrass = function (ok) {
    if (!COD.scene) return;
    const gr = mulberry32(31337), pts = [];
    let guard = 0;
    while (pts.length < 2600 && guard++ < 30000) {
      const a = gr() * Math.PI * 2, r = 8 + Math.sqrt(gr()) * 182;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
      if (h < 0.75) continue;
      if (ok && !ok(x, z)) continue;
      pts.push([x, h, z]);
    }
    const g = new THREE.BufferGeometry();
    const P = [], U = [], I = [];
    for (let q = 0; q < 3; q++) {
      const a = q * Math.PI / 3, cx = Math.cos(a) * 0.38, cz = Math.sin(a) * 0.38, b = P.length / 3;
      P.push(-cx, 0, -cz, cx, 0, cz, cx, 0.6, cz, -cx, 0.6, -cz);
      U.push(0, 0, 1, 0, 1, 1, 0, 1);
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ map: W._grassBlade, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    const im = new THREE.InstancedMesh(g, m, pts.length);
    const dm = new THREE.Object3D(), tint = new THREE.Color();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], s = 0.7 + gr() * 0.9;
      dm.position.set(p[0], p[1] - 0.02, p[2]); dm.rotation.set(0, gr() * 6.28, 0); dm.scale.set(s, s * (0.8 + gr() * 0.6), s);
      dm.updateMatrix(); im.setMatrixAt(i, dm.matrix);
      tint.setHSL(0.22 + gr() * 0.08, 0.45 + gr() * 0.2, 0.42 + gr() * 0.18); im.setColorAt(i, tint);
    }
    im.receiveShadow = true; im.frustumCulled = false;
    COD.scene.add(im);
  };

  // ---------------------------------------------------------------- team spawns
  function computeSpawns() {
    const n = Math.max(2, (COD.config && COD.config.teamCount) || 4);
    W.teamSpawns.length = 0;
    const base = Math.PI / 4;
    for (let i = 0; i < n; i++) {
      const a = base + i * Math.PI * 2 / n;
      const dx = Math.cos(a), dz = Math.sin(a);
      let r = 232;
      while (r > 100 && heightAt(dx * r, dz * r) < 0.03) r -= 0.5;
      r -= 4;
      const to = new THREE.Vector3(dx * r, groundAt(dx * r, dz * r), dz * r);
      const from = new THREE.Vector3(dx * 330, 0, dz * 330);
      W.teamSpawns.push({ from: from, to: to, yaw: W.faceYaw(-dx, -dz) });
    }
  }
  W.recomputeSpawns = computeSpawns;

  // ---------------------------------------------------------------- init / update
  W.init = function () {
    const scene = COD.scene;
    if (COD.camera && COD.camera.far < 2200) { COD.camera.far = 2200; COD.camera.updateProjectionMatrix(); }
    buildMaterials();
    W.staticBatch = new Batch();
    paintMinimap();
    computeSpawns();
    if (scene) {
      buildSky(scene);
      buildTerrain(scene);
      buildOcean(scene);
      buildNature(scene);
    } else {
      buildNature({ add: function () {} });
    }
    for (let i = 0; i < W.teamSpawns.length; i++) W.mapDot(W.teamSpawns[i].to.x, W.teamSpawns[i].to.z, 2, '#ffffff');
  };

  let tAcc = 0;
  W.update = function (dt) {
    tAcc += dt;
    if (waterU) waterU.time.value = tAcc;
    const cam = COD.camera;
    if (skyGroup && cam) skyGroup.position.copy(cam.position);
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.position.x += dt * 2.5;
      if (c.position.x > 900) c.position.x = -900;
    }
    updateSun();
  };
})();
