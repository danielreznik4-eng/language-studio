(function () {
  'use strict';
  const COD = window.COD;

  const GRAVITY = 20;
  let group = null;

  // shared geometry / materials
  let gSphere, tracerGeo, planeGeo;
  const grenades = [], rockets = [], mortars = [], tracers = [];
  const texCache = {};
  const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
  const lowGfx = function () { return COD.config && COD.config.gfx === 'low'; };

  // ---------------------------------------------------------------- canvas textures
  function canvasTex(size, draw) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    draw(cv.getContext('2d'), size);
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function getTex(name) {
    if (texCache[name]) return texCache[name];
    let t;
    if (name === 'soft') {
      t = canvasTex(64, function (g, n) {
        const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.35, 'rgba(255,255,255,0.65)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, n, n);
      });
    } else if (name === 'spark') {
      t = canvasTex(32, function (g, n) {
        g.clearRect(0, 0, n, n);
        const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n * 0.42);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.4, 'rgba(255,255,255,0.5)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(n / 2, n / 2, n * 0.42, 0, 6.2832); g.fill();
      });
    } else if (name === 'smoke') {
      t = canvasTex(128, function (g, n) {
        for (let i = 0; i < 16; i++) {
          const x = n / 2 + (Math.random() - 0.5) * n * 0.45, y = n / 2 + (Math.random() - 0.5) * n * 0.45;
          const r = n * (0.14 + Math.random() * 0.16);
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.45)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(0, 0, n, n);
        }
        g.globalCompositeOperation = 'destination-in';
        const m = g.createRadialGradient(n / 2, n / 2, n * 0.12, n / 2, n / 2, n / 2);
        m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = m; g.fillRect(0, 0, n, n);
      });
    } else if (name === 'hole') {
      t = canvasTex(64, function (g, n) {
        const gr = g.createRadialGradient(n / 2, n / 2, 1, n / 2, n / 2, n / 2);
        gr.addColorStop(0, 'rgba(0,0,0,0.95)');
        gr.addColorStop(0.28, 'rgba(10,8,6,0.85)');
        gr.addColorStop(0.5, 'rgba(40,32,26,0.35)');
        gr.addColorStop(1, 'rgba(40,32,26,0)');
        g.fillStyle = gr; g.fillRect(0, 0, n, n);
        g.strokeStyle = 'rgba(20,16,12,0.5)'; g.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * 6.28, l = n * (0.25 + Math.random() * 0.2);
          g.beginPath(); g.moveTo(n / 2, n / 2); g.lineTo(n / 2 + Math.cos(a) * l, n / 2 + Math.sin(a) * l); g.stroke();
        }
      });
    } else if (name === 'scorch') {
      t = canvasTex(128, function (g, n) {
        for (let i = 0; i < 22; i++) {
          const a = Math.random() * 6.28, d = Math.random() * n * 0.22;
          const x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d, r = n * (0.14 + Math.random() * 0.2);
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(8,6,5,0.5)'); gr.addColorStop(1, 'rgba(8,6,5,0)');
          g.fillStyle = gr; g.fillRect(0, 0, n, n);
        }
        g.globalCompositeOperation = 'destination-in';
        const m = g.createRadialGradient(n / 2, n / 2, n * 0.15, n / 2, n / 2, n / 2);
        m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = m; g.fillRect(0, 0, n, n);
      });
    } else if (name === 'ring') {
      t = canvasTex(128, function (g, n) {
        const gr = g.createRadialGradient(n / 2, n / 2, n * 0.3, n / 2, n / 2, n / 2);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.75, 'rgba(255,255,255,0.8)');
        gr.addColorStop(0.9, 'rgba(255,255,255,0.25)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, n, n);
      });
    }
    texCache[name] = t;
    return t;
  }

  // ---------------------------------------------------------------- sprite particle pools
  // Two pools: additive (fire, sparks, glow) and normal blending (smoke, dust, debris).
  let poolFire, poolSmoke, poolSpark;
  function makePool(count, additive, texName) {
    const pool = { list: [], idx: 0 };
    const tex = getTex(texName);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.renderOrder = additive ? 5 : 4;
      group.add(sp);
      pool.list.push({
        sp: sp, vel: new THREE.Vector3(), c0: new THREE.Color(), c1: new THREE.Color(),
        life: 0, max: 1, grav: 0, grow: 0, size: 1, drag: 0, a0: 1, spin: 0, active: false
      });
    }
    return pool;
  }

  function emit(pool, pos, vx, vy, vz, size, col0, col1, life, grav, grow, drag, a0) {
    const p = pool.list[pool.idx++ % pool.list.length];
    p.active = true;
    p.life = life; p.max = life; p.grav = grav; p.grow = grow; p.size = size;
    p.drag = drag || 0; p.a0 = a0 === undefined ? 1 : a0;
    p.vel.set(vx, vy, vz);
    p.c0.setHex(col0); p.c1.setHex(col1);
    p.spin = (Math.random() - 0.5) * 1.5;
    const sp = p.sp;
    sp.position.copy(pos);
    sp.scale.setScalar(size);
    sp.material.color.copy(p.c0);
    sp.material.opacity = p.a0;
    sp.material.rotation = Math.random() * 6.28;
    sp.visible = true;
  }
  function fireP(pos, vx, vy, vz, size, c0, c1, life, grav, grow, drag, a0) { emit(poolFire, pos, vx, vy, vz, size, c0, c1, life, grav, grow, drag, a0); }
  function sparkP(pos, vx, vy, vz, size, c0, c1, life, grav, grow, drag, a0) { emit(poolSpark, pos, vx, vy, vz, size, c0, c1, life, grav, grow, drag, a0); }
  function smokeP(pos, vx, vy, vz, size, c0, c1, life, grav, grow, drag, a0) { emit(poolSmoke, pos, vx, vy, vz, size, c0, c1, life, grav, grow, drag, a0); }

  function updatePool(pool, dt) {
    const l = pool.list;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; p.sp.visible = false; continue; }
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y -= p.grav * dt;
      p.sp.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;            // 1 -> 0
      p.sp.material.opacity = p.a0 * Math.min(1, (1 - k) * 12) * Math.min(1, k * 1.8);
      p.sp.material.color.copy(p.c0).lerp(p.c1, 1 - k);
      p.sp.material.rotation += p.spin * dt;
      p.sp.scale.setScalar(Math.max(0.01, p.size * (1 + p.grow * (1 - k))));
    }
  }

  // ---------------------------------------------------------------- decals (bullet holes + scorch)
  const holes = [], scorches = [];
  let holeIdx = 0, scorchIdx = 0;
  function makeDecals(list, count, texName, life) {
    const tex = getTex(texName);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
      });
      const m = new THREE.Mesh(planeGeo, mat);
      m.visible = false; m.renderOrder = 2;
      group.add(m);
      list.push({ mesh: m, age: 0, life: life, active: false });
    }
  }
  function placeDecal(list, idx, point, normal, size) {
    const d = list[idx % list.length];
    const m = d.mesh;
    m.position.copy(point).addScaledVector(normal, 0.025);
    m.lookAt(_v.copy(point).add(normal));
    m.rotateZ(Math.random() * 6.28);
    m.scale.set(size, size, 1);
    m.material.opacity = 1;
    m.visible = true;
    d.age = 0; d.active = true;
  }
  function updateDecals(list, dt) {
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (!d.active) continue;
      d.age += dt;
      const rem = d.life - d.age;
      if (rem <= 0) { d.active = false; d.mesh.visible = false; continue; }
      if (rem < 5) d.mesh.material.opacity = rem / 5;
    }
  }

  // ---------------------------------------------------------------- pooled point lights (2 total from this module)
  let boomLight = null, boomLife = 0, boomMax = 1, boomPeak = 0;
  let muzzleL = null, muzzleLife = 0;
  function muzzleLight(pos, size) {
    if (!muzzleL || lowGfx()) return;
    muzzleL.position.copy(pos);
    muzzleL.intensity = 3 + (size || 0.45) * 5;
    muzzleLife = 0.05;
  }

  // ---------------------------------------------------------------- impacts
  function spawnImpact(point, normal, noDecal) {
    if (!point) return;
    const hasN = !!normal;
    const nx = hasN ? normal.x : 0, ny = hasN ? normal.y : 1, nz = hasN ? normal.z : 0;
    const w = COD.world;
    // water splash
    if (w && w.isWater && point.y < 0.6 && w.isWater(point.x, point.z)) {
      for (let i = 0; i < 6; i++) {
        _p.set(point.x, Math.max(0.05, point.y), point.z);
        smokeP(_p, (Math.random() - 0.5) * 2.5, 3 + Math.random() * 3, (Math.random() - 0.5) * 2.5,
          0.25, 0xffffff, 0xaad4ee, 0.7, 12, 1.5, 0, 0.8);
      }
      return;
    }
    // sparks
    for (let i = 0; i < 5; i++) {
      _p.copy(point);
      sparkP(_p, nx * 4 + (Math.random() - 0.5) * 6, ny * 4 + Math.random() * 3, nz * 4 + (Math.random() - 0.5) * 6,
        0.07, 0xffc040, 0xff5a10, 0.25 + Math.random() * 0.2, 14, -0.4, 0, 0.9);
    }
    // hot flash at the contact point
    _p.set(point.x + nx * 0.05, point.y + ny * 0.05, point.z + nz * 0.05);
    fireP(_p, 0, 0, 0, 0.22, 0xffd070, 0xff9a30, 0.05, 0, 0.3, 0, 0.7);
    // dust puff
    for (let i = 0; i < 2; i++) {
      _p.copy(point);
      smokeP(_p, nx * 1.2 + (Math.random() - 0.5), ny * 1.2 + Math.random() * 0.6, nz * 1.2 + (Math.random() - 0.5),
        0.2, 0xb8a98f, 0x8a8070, 0.6, -0.3, 2.2, 1.5, 0.5);
    }
    if (hasN && !noDecal) {
      _n.set(nx, ny, nz);
      placeDecal(holes, holeIdx++, point, _n, 0.2 + Math.random() * 0.06);
    }
  }

  // ---------------------------------------------------------------- tracers
  // Tapered streak (bright wide head, needle tail) that travels from the muzzle to the impact point.
  const TRACER_SPEED = 380, TRACER_LEN = 9;
  function initTracers() {
    tracerGeo = new THREE.CylinderGeometry(1, 0.02, 1, 6, 1, true);
    tracerGeo.rotateX(Math.PI / 2);   // wide end (top) -> +Z
    tracerGeo.translate(0, 0, -0.5);  // head at origin, tail toward -Z
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe7a0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false
      });
      const m = new THREE.Mesh(tracerGeo, mat);
      m.visible = false; m.frustumCulled = false; m.renderOrder = 6;
      group.add(m);
      tracers.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, age: 0, active: false });
    }
  }
  let tracerIdx = 0;
  function spawnTracer(from, to) {
    if (!tracers.length) return;
    _v.subVectors(to, from);
    const len = _v.length();
    if (len < 1.5) return;
    const t = tracers[tracerIdx++ % tracers.length];
    t.from.copy(from); t.dir.copy(_v).divideScalar(len); t.len = len; t.age = 0; t.active = true;
    t.mesh.visible = true;
    t.mesh.position.copy(from);
    t.mesh.lookAt(_p.copy(from).add(t.dir));
    t.mesh.scale.set(0.001, 0.001, 0.001);
  }
  function updateTracers(dt) {
    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (!t.active) continue;
      t.age += dt;
      const head = t.age * TRACER_SPEED;
      if (head - TRACER_LEN > t.len) { t.active = false; t.mesh.visible = false; continue; }
      const h = Math.min(head, t.len);
      const tail = Math.max(0, head - TRACER_LEN);
      const seg = Math.max(0.2, h - tail);
      t.mesh.position.copy(t.from).addScaledVector(t.dir, h);
      t.mesh.scale.set(0.045, 0.045, seg);
      t.mesh.material.opacity = Math.min(1, (t.len - tail) / 3);
    }
  }

  // ---------------------------------------------------------------- explosions
  function aabbDist(c, p) {
    const dx = Math.max(c.min.x - p.x, 0, p.x - c.max.x);
    const dy = Math.max(c.min.y - p.y, 0, p.y - c.max.y);
    const dz = Math.max(c.min.z - p.z, 0, p.z - c.max.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const FAN = [];
  (function () {
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
     [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]
      .forEach(function (a) { FAN.push(new THREE.Vector3(a[0], a[1], a[2]).normalize()); });
  })();

  // shockwave rings (flat on the ground, additive, expand + fade)
  const rings = [];
  let ringIdx = 0;
  const DOWN = new THREE.Vector3(0, -1, 0);
  function initRings() {
    const tex = getTex('ring');
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        color: 0xffc080, side: THREE.DoubleSide
      });
      const m = new THREE.Mesh(planeGeo, mat);
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 3;
      group.add(m);
      rings.push({ mesh: m, age: 0, life: 0.5, maxSize: 10, active: false });
    }
  }
  function updateRings(dt) {
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      if (!r.active) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const s = r.maxSize * (0.15 + 0.85 * Math.sqrt(k));
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = (1 - k) * 0.8;
    }
  }

  function explosionVisuals(pos, radius) {
    const s = Math.max(0.5, Math.min(1.9, radius / 7));
    const low = lowGfx();
    const tmp = _p;
    // find the ground below for scorch / ring / dust
    let ground = null, gN = null;
    if (COD.world && COD.world.raycast) {
      tmp.set(pos.x, pos.y + 0.8, pos.z);
      const gh = COD.world.raycast(tmp, DOWN, 5);
      if (gh) { ground = gh.point; gN = gh.normal; }
    }
    const nearGround = !!ground && (pos.y - ground.y) < 2.5;
    const water = COD.world && COD.world.isWater && pos.y < 1.5 && COD.world.isWater(pos.x, pos.z);

    // white-hot core flash
    tmp.copy(pos);
    fireP(tmp, 0, 0.5, 0, radius * 0.9, 0xffc060, 0xff7a20, 0.1, 0, 0.4, 0, 0.7);
    // fireballs
    const nF = low ? 5 : 9;
    for (let i = 0; i < nF; i++) {
      tmp.set(pos.x + (Math.random() - 0.5) * radius * 0.4, pos.y + Math.random() * radius * 0.25,
        pos.z + (Math.random() - 0.5) * radius * 0.4);
      fireP(tmp, (Math.random() - 0.5) * radius * 0.9, 1 + Math.random() * radius * 0.45, (Math.random() - 0.5) * radius * 0.9,
        radius * (0.3 + Math.random() * 0.3), 0xffa040, 0xff2a05, 0.45 + Math.random() * 0.35, -1.5, 1.0, 2.5, 0.6);
    }
    // sparks
    const nS = low ? 12 : 28;
    for (let i = 0; i < nS; i++) {
      tmp.copy(pos);
      const a = Math.random() * 6.28, up = 0.3 + Math.random() * 0.9, sp = (8 + Math.random() * 18) * s;
      sparkP(tmp, Math.cos(a) * sp, up * sp, Math.sin(a) * sp,
        0.13 * s, 0xffb030, 0xff4000, 0.6 + Math.random() * 0.7, 18, -0.3, 0.6, 0.9);
    }
    // smoke columns (dark, long life, rising)
    const nM = low ? 6 : 11;
    for (let i = 0; i < nM; i++) {
      tmp.set(pos.x + (Math.random() - 0.5) * radius * 0.5, pos.y + 0.5 + Math.random() * radius * 0.3,
        pos.z + (Math.random() - 0.5) * radius * 0.5);
      smokeP(tmp, (Math.random() - 0.5) * 3, 2.5 + Math.random() * 4, (Math.random() - 0.5) * 3,
        radius * (0.35 + Math.random() * 0.3), 0x2b2724, 0x8a8782, 2.6 + Math.random() * 1.8, -0.4, 2.4, 0.5, 0.8);
    }
    // debris chunks
    const nD = low ? 6 : 14;
    for (let i = 0; i < nD; i++) {
      tmp.copy(pos);
      smokeP(tmp, (Math.random() - 0.5) * 18 * s, 4 + Math.random() * 11 * s, (Math.random() - 0.5) * 18 * s,
        0.12 + Math.random() * 0.14, 0x3a3128, 0x1a1612, 0.9 + Math.random() * 0.9, 20, -0.2, 0, 1);
    }
    // ground dust ring or water spray
    if (nearGround || water) {
      const gy = water ? 0.1 : ground.y + 0.3;
      const nR = low ? 6 : 10;
      for (let i = 0; i < nR; i++) {
        const a = (i / nR) * 6.28 + Math.random() * 0.4, sp = (7 + Math.random() * 5) * s;
        tmp.set(pos.x, gy, pos.z);
        if (water) smokeP(tmp, Math.cos(a) * sp * 0.6, 5 + Math.random() * 6, Math.sin(a) * sp * 0.6, radius * 0.25, 0xffffff, 0xaad0e8, 1.1, 9, 1.6, 0.5, 0.8);
        else smokeP(tmp, Math.cos(a) * sp, 0.5 + Math.random(), Math.sin(a) * sp, radius * 0.3, 0xb09a78, 0x7a6f5e, 1.3, 0, 2, 1.8, 0.65);
      }
      // shockwave ring
      const r = rings[ringIdx++ % rings.length];
      r.mesh.position.set(pos.x, gy + 0.08, pos.z);
      r.age = 0; r.life = 0.45; r.maxSize = radius * 3.2; r.active = true; r.mesh.visible = true;
      // scorch decal
      if (!water && gN) placeDecal(scorches, scorchIdx++, ground, gN, radius * 2.0);
    }
    // brief light flash
    if (boomLight && !low) {
      boomLight.position.set(pos.x, pos.y + 1.2, pos.z);
      boomLight.distance = radius * 1.7;
      boomPeak = 5 * s; boomLife = boomMax = 0.2;
      boomLight.intensity = boomPeak;
    }
  }

  function explode(pos, radius, damage, attacker, weaponId) {
    const center = new THREE.Vector3().copy(pos);
    const eye = new THREE.Vector3(pos.x, pos.y + 0.4, pos.z);
    const tmp = new THREE.Vector3();
    const wid = weaponId || 'explosion';

    // actors
    const acts = COD.actors;
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (!a.alive || !a.pos || a.eliminated) continue;
      const cy = a.kind === 'drone' ? a.pos.y : Math.max(a.pos.y, Math.min(pos.y, a.pos.y + a.height));
      tmp.set(a.pos.x, cy, a.pos.z);
      const d = Math.max(0, tmp.distanceTo(pos) - a.radius);
      if (d > radius) continue;
      if (a.hidden && d > 2) continue; // lockers shield from blasts
      if (COD.world && COD.world.lineOfSight && d > 1.5) {
        tmp.set(a.pos.x, a.kind === 'drone' ? a.pos.y : a.pos.y + a.height * 0.6, a.pos.z);
        if (!COD.world.lineOfSight(eye, tmp)) continue;
      }
      const amt = damage * Math.max(0.12, 1 - d / radius);
      COD.combat.damage(a, amt, { attacker: attacker, weaponId: wid, headshot: false, point: tmp.clone() });
    }

    // vehicles
    if (COD.vehicles && COD.vehicles.list && COD.vehicles.damage) {
      const vl = COD.vehicles.list;
      for (let i = 0; i < vl.length; i++) {
        const v = vl[i];
        if (!v || !v.pos || v.hp <= 0) continue;
        const d = v.pos.distanceTo(pos) - 1.5;
        if (d > radius) continue;
        try { COD.vehicles.damage(v, damage * Math.max(0.15, 1 - d / radius), attacker); } catch (e) { console.warn(e); }
      }
    }

    // colliders with onHit (windows etc.)
    const w = COD.world;
    if (w) {
      const hitSet = new Set();
      if (Array.isArray(w.colliders)) {
        for (let i = 0; i < w.colliders.length; i++) {
          const c = w.colliders[i];
          if (!c || c.enabled === false || typeof c.onHit !== 'function') continue;
          if (aabbDist(c, pos) <= radius) hitSet.add(c);
        }
      } else if (w.raycast) {
        for (let i = 0; i < FAN.length; i++) {
          const r = w.raycast(eye, FAN[i], radius);
          if (r && r.collider && typeof r.collider.onHit === 'function') hitSet.add(r.collider);
        }
      }
      hitSet.forEach(function (c) {
        try { c.onHit(damage, { attacker: attacker, weaponId: wid, point: center, explosion: true }); } catch (e) { console.warn(e); }
      });
    }

    explosionVisuals(pos, radius);
    if (COD.sfx) COD.sfx('explosion', pos);
    COD.emit('explosion', { pos: center, radius: radius });
  }

  // ---------------------------------------------------------------- grenades
  let grenadeMats = null, gBody, gCap, gBand;
  function grenadeMaterials() {
    if (grenadeMats) return;
    gBody = new THREE.MeshStandardMaterial({ color: 0x3f4a2c, roughness: 0.55, metalness: 0.35 });
    gCap = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.35, metalness: 0.9 });
    grenadeMats = [];
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Color(COD.RARITY[i].color);
      grenadeMats.push(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.5 }));
    }
    gBand = new THREE.CylinderGeometry(1, 1, 1, 12);
  }
  function makeGrenadeMesh(rarity) {
    grenadeMaterials();
    const g = new THREE.Group();
    const body = new THREE.Mesh(gSphere, gBody);
    body.scale.set(0.07, 0.09, 0.07);
    const band = new THREE.Mesh(gBand, grenadeMats[Math.max(0, Math.min(4, rarity))]);
    band.scale.set(0.073, 0.012, 0.073);
    const cap = new THREE.Mesh(gBand, gCap);
    cap.scale.set(0.03, 0.04, 0.03); cap.position.y = 0.1;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.03), gCap);
    lever.position.set(0.05, 0.07, 0); lever.rotation.z = -0.25;
    g.add(body); g.add(band); g.add(cap); g.add(lever);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  function throwGrenade(actor, origin, dir, rarity) {
    rarity = rarity | 0;
    const mesh = makeGrenadeMesh(rarity);
    mesh.position.copy(origin);
    group.add(mesh);
    const d = dir.clone().normalize();
    const vel = d.multiplyScalar(17);
    vel.y += 3.5;
    if (actor && actor.vel) vel.addScaledVector(actor.vel, 0.4);
    grenades.push({ mesh: mesh, vel: vel, fuse: 2.5, rarity: rarity, owner: actor, stopped: false, pos: mesh.position, spark: 0 });
    if (COD.sfx) COD.sfx('reload', origin);
    return true;
  }

  // throws the strongest grenade the actor has and removes it from actor.grenades
  function throwFromInventory(actor, origin, dir) {
    if (!actor || !actor.grenades || !actor.grenades.length) return false;
    let bi = 0;
    for (let i = 1; i < actor.grenades.length; i++) if (actor.grenades[i] > actor.grenades[bi]) bi = i;
    const r = actor.grenades.splice(bi, 1)[0];
    return throwGrenade(actor, origin, dir, r);
  }

  const _step = new THREE.Vector3(), _dn = new THREE.Vector3();
  function updateGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        const m = COD.RARITY[g.rarity].mult;
        explode(g.pos, 7, 130 * m, g.owner, 'grenade');
        group.remove(g.mesh);
        grenades.splice(i, 1);
        continue;
      }
      // fuse spark trail
      g.spark -= dt;
      if (g.spark <= 0) {
        g.spark = 0.05;
        _p.copy(g.pos); _p.y += 0.1;
        sparkP(_p, (Math.random() - 0.5), 0.5 + Math.random(), (Math.random() - 0.5), 0.06, 0xffc040, 0xff5a10, 0.2, 4, -0.2, 0, 0.9);
      }
      if (!g.stopped) {
        g.vel.y -= GRAVITY * dt;
        _step.copy(g.vel).multiplyScalar(dt);
        const len = _step.length();
        let hit = null;
        if (len > 1e-5 && COD.world && COD.world.raycast) {
          _dn.copy(_step).divideScalar(len);
          hit = COD.world.raycast(g.pos, _dn, len + 0.1);
        }
        if (hit) {
          if (hit.normal) _n.copy(hit.normal); else _n.set(0, 1, 0);
          g.pos.copy(hit.point).addScaledVector(_n, 0.13);
          const vn = g.vel.dot(_n);
          g.vel.addScaledVector(_n, -2 * vn).multiplyScalar(0.5);
          if (g.vel.length() < 1.6) { g.vel.set(0, 0, 0); g.stopped = true; }
        } else {
          g.pos.add(_step);
        }
        const w = COD.world;
        if (w && w.heightAt) {
          const h = w.heightAt(g.pos.x, g.pos.z) + 0.12;
          if (g.pos.y < h) {
            g.pos.y = h;
            if (g.vel.y < 0) g.vel.y *= -0.35;
            g.vel.x *= 0.7; g.vel.z *= 0.7;
            if (g.vel.length() < 1.6) { g.vel.set(0, 0, 0); g.stopped = true; }
          }
        }
        g.mesh.rotation.x += dt * 8;
        g.mesh.rotation.z += dt * 5;
      }
    }
  }

  // ---------------------------------------------------------------- rockets
  let rocketMats = null;
  function makeRocketMesh() {
    if (!rocketMats) {
      rocketMats = {
        body: new THREE.MeshStandardMaterial({ color: 0x59653a, roughness: 0.5, metalness: 0.5 }),
        head: new THREE.MeshStandardMaterial({ color: 0xb33a2a, roughness: 0.45, metalness: 0.4 }),
        fin: new THREE.MeshStandardMaterial({ color: 0x2f3320, roughness: 0.6, metalness: 0.4 }),
        glow: new THREE.SpriteMaterial({ map: getTex('soft'), color: 0xffb050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      };
    }
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 10), rocketMats.body);
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 10), rocketMats.head);
    tip.rotation.x = -Math.PI / 2; tip.position.z = -0.54;
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.1, 10), rocketMats.head);
    bulb.rotation.x = Math.PI / 2; bulb.position.z = -0.4;
    g.add(body); g.add(tip); g.add(bulb);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.16, 0.2), rocketMats.fin);
      fin.position.z = 0.32;
      const holder = new THREE.Group();
      holder.rotation.z = i * Math.PI / 2;
      fin.position.y = 0.09;
      holder.add(fin);
      g.add(holder);
    }
    const glow = new THREE.Sprite(rocketMats.glow);
    glow.position.z = 0.55; glow.scale.setScalar(0.9);
    g.add(glow);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  function fireRocket(actor, origin, dir, inst) {
    const mesh = makeRocketMesh();
    const d = dir.clone().normalize();
    mesh.position.copy(origin).addScaledVector(d, 1.0);
    mesh.lookAt(mesh.position.clone().add(d));
    group.add(mesh);
    // back-blast: smoke + flame behind the launcher
    for (let i = 0; i < 8; i++) {
      _p.copy(origin).addScaledVector(d, -0.6);
      smokeP(_p, -d.x * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2, -d.y * 2 + Math.random(), -d.z * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2,
        0.5, 0xd8d4cc, 0x8a8782, 1.2, -0.3, 2.5, 1, 0.7);
    }
    _p.copy(origin).addScaledVector(d, -0.5);
    fireP(_p, -d.x * 4, -d.y * 4, -d.z * 4, 1.1, 0xfff0b0, 0xff5a10, 0.15, 0, 0.6, 0, 1);
    const dmg = inst && inst.stats ? inst.stats.damage : 150;
    rockets.push({ mesh: mesh, dir: d, speed: 48, life: 7, owner: actor, damage: dmg, radius: 7, trail: 0 });
  }

  function updateRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.life -= dt;
      const stepLen = r.speed * dt;
      const pos = r.mesh.position;
      let boom = null;
      const h = COD.weapons ? COD.weapons.hitscan(r.owner, pos, r.dir, stepLen + 0.3) : null;
      if (h) {
        boom = h.point;
        if (h.collider && typeof h.collider.onHit === 'function') {
          try { h.collider.onHit(r.damage, { attacker: r.owner, weaponId: 'rpg', point: h.point }); } catch (e) { console.warn(e); }
        }
      } else {
        pos.addScaledVector(r.dir, stepLen);
        if (COD.world && COD.world.heightAt && pos.y < Math.max(0, COD.world.heightAt(pos.x, pos.z))) boom = pos;
        else if (r.life <= 0) boom = pos;
      }
      r.trail -= dt;
      if (r.trail <= 0) {
        r.trail = 0.016;
        _p.copy(pos).addScaledVector(r.dir, 0.55);
        // thick grey trail that spreads out
        smokeP(_p, (Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8,
          0.35, 0xe2dfd8, 0x7d7a75, 1.8 + Math.random() * 0.6, -0.15, 3.2, 0.5, 0.6);
        // hot flame at the tail
        fireP(_p, 0, 0, 0, 0.55, 0xfff0b0, 0xff4a08, 0.12, 0, -0.3, 0, 1);
      }
      if (boom) {
        const bp = boom.clone();
        bp.addScaledVector(r.dir, -0.3);   // pull off the surface so LOS checks work
        explode(bp, r.radius, r.damage, r.owner, 'rpg');
        group.remove(r.mesh);
        rockets.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- mortar shells
  let shellMats = null;
  function makeShellMesh() {
    if (!shellMats) {
      shellMats = {
        body: new THREE.MeshStandardMaterial({ color: 0x4a5340, roughness: 0.5, metalness: 0.6 }),
        nose: new THREE.MeshStandardMaterial({ color: 0xc2a23a, roughness: 0.4, metalness: 0.8 })
      };
    }
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 10), shellMats.body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 10), shellMats.nose);
    nose.position.y = -0.47; nose.rotation.x = Math.PI;      // nose pointing down (-Y)
    g.add(body); g.add(nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.2, 0.14), shellMats.body);
      const holder = new THREE.Group();
      holder.rotation.y = i * Math.PI / 2;
      fin.position.set(0, 0.4, 0.12);
      holder.add(fin);
      g.add(holder);
    }
    g.scale.setScalar(1.6);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  function fireMortar(actor, targetPos, inst) {
    const ty = COD.world && COD.world.heightAt ? Math.max(0, COD.world.heightAt(targetPos.x, targetPos.z)) : targetPos.y;
    const target = new THREE.Vector3(targetPos.x, ty, targetPos.z);
    const R = 10;
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.8, R, 48),
      new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(target.x, ty + 0.35, target.z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.8, 32),
      new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(target.x, ty + 0.3, target.z);
    group.add(ring); group.add(disc);
    const shell = makeShellMesh();
    shell.visible = false;
    group.add(shell);
    const dmg = inst && inst.stats ? inst.stats.damage : 220;
    mortars.push({ target: target, t: 0, total: 3, fall: 1.2, ring: ring, disc: disc, shell: shell, owner: actor, damage: dmg, radius: R, trail: 0 });
    // launch puff at the shooter
    if (actor && actor.pos) {
      for (let i = 0; i < 6; i++) {
        _p.set(actor.pos.x, actor.pos.y + 1.2, actor.pos.z);
        smokeP(_p, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0xd8d4cc, 0x8a8782, 1.4, -0.3, 2.5, 1, 0.6);
      }
    }
    if (COD.sfx) COD.sfx('shot', actor && actor.pos);
  }

  function updateMortars(dt) {
    for (let i = mortars.length - 1; i >= 0; i--) {
      const m = mortars[i];
      m.t += dt;
      m.ring.material.opacity = 0.55 + 0.35 * Math.sin(m.t * 10);
      const s = 1 + 0.03 * Math.sin(m.t * 10);
      m.ring.scale.set(s, s, 1);
      const fs = m.total - m.fall;
      if (m.t >= fs && m.t < m.total) {
        const k = (m.t - fs) / m.fall;
        m.shell.visible = true;
        m.shell.position.set(m.target.x, m.target.y + (1 - k * k) * 110, m.target.z);
        m.shell.rotation.y += dt * 12;
        // falling streak: bright thread + thin smoke high in the sky
        m.trail -= dt;
        if (m.trail <= 0) {
          m.trail = 0.025;
          _p.copy(m.shell.position); _p.y += 1.2;
          fireP(_p, 0, 0, 0, 0.5, 0xffffff, 0xffb060, 0.25, 0, 0.5, 0, 0.55);
          smokeP(_p, (Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5, 0.7, 0xf0eee8, 0x9a9792, 1.6, 0, 3, 0.3, 0.45);
        }
      }
      if (m.t >= m.total) {
        explode(m.target, m.radius, m.damage, m.owner, 'mortar');
        group.remove(m.ring); group.remove(m.disc); group.remove(m.shell);
        m.ring.geometry.dispose(); m.ring.material.dispose();
        m.disc.geometry.dispose(); m.disc.material.dispose();
        mortars.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- module
  function init() {
    group = new THREE.Group();
    group.name = 'projectiles';
    COD.scene.add(group);
    gSphere = new THREE.SphereGeometry(1, 12, 10);
    planeGeo = new THREE.PlaneGeometry(1, 1);
    poolFire = makePool(lowGfx() ? 180 : 320, true, 'soft');
    poolSpark = makePool(lowGfx() ? 100 : 180, true, 'spark');
    poolSmoke = makePool(lowGfx() ? 140 : 240, false, 'smoke');
    makeDecals(holes, 60, 'hole', 30);
    makeDecals(scorches, 12, 'scorch', 45);
    initRings();
    initTracers();
    // two pooled point lights, always in the scene (intensity 0 when idle) so shaders never recompile mid-game
    if (!lowGfx()) {
      boomLight = new THREE.PointLight(0xff8030, 0, 12, 2);
      muzzleL = new THREE.PointLight(0xffc070, 0, 14, 2);
      COD.scene.add(boomLight); COD.scene.add(muzzleL);
    }
  }

  function update(dt) {
    if (!group) return;
    updateGrenades(dt);
    updateRockets(dt);
    updateMortars(dt);
    updatePool(poolFire, dt);
    updatePool(poolSpark, dt);
    updatePool(poolSmoke, dt);
    updateTracers(dt);
    updateRings(dt);
    updateDecals(holes, dt);
    updateDecals(scorches, dt);
    if (boomLight && boomLife > 0) {
      boomLife -= dt;
      const k = Math.max(0, boomLife / boomMax);
      boomLight.intensity = boomPeak * k * k;
    }
    if (muzzleL && muzzleLife > 0) {
      muzzleLife -= dt;
      if (muzzleLife <= 0) muzzleL.intensity = 0;
    }
  }

  COD.projectiles = {
    init: init, update: update,
    throwGrenade: throwGrenade, throwFromInventory: throwFromInventory,
    fireRocket: fireRocket, fireMortar: fireMortar,
    explode: explode, spawnTracer: spawnTracer, spawnImpact: spawnImpact,
    muzzleLight: muzzleLight
  };
})();
