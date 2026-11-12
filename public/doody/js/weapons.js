(function () {
  'use strict';
  const COD = window.COD;

  // ---------------------------------------------------------------- data
  // damage = per bullet/pellet, spread = cone half-angle (radians), recoil = kick (degrees-ish)
  function D(id, name, cls, ammoType, o) {
    return Object.assign({
      id: id, name: name, cls: cls, ammoType: ammoType,
      damage: 20, rpm: 600, magSize: 30, reloadTime: 2, spread: 0.015, recoil: 1,
      range: 100, auto: true, pellets: 1, adsZoom: 1.3, headshotMult: 2
    }, o);
  }
  const DEFS = {
    pistol_m9:     D('pistol_m9', 'M9', 'pistol', 'pistol', { damage: 24, rpm: 420, magSize: 15, reloadTime: 1.4, spread: 0.012, recoil: 0.8, range: 60, auto: false, adsZoom: 1.2 }),
    pistol_deagle: D('pistol_deagle', 'Desert Eagle', 'pistol', 'pistol', { damage: 55, rpm: 200, magSize: 7, reloadTime: 1.8, spread: 0.008, recoil: 2.4, range: 80, auto: false, adsZoom: 1.3, headshotMult: 2.2 }),
    smg_mp5:       D('smg_mp5', 'MP5', 'smg', 'smg', { damage: 20, rpm: 800, magSize: 30, reloadTime: 1.9, spread: 0.02, recoil: 0.7, range: 55, adsZoom: 1.3, headshotMult: 1.8 }),
    smg_vector:    D('smg_vector', 'Vector', 'smg', 'smg', { damage: 17, rpm: 1100, magSize: 25, reloadTime: 1.7, spread: 0.025, recoil: 0.6, range: 45, adsZoom: 1.25, headshotMult: 1.7 }),
    ar_m4:         D('ar_m4', 'M4', 'ar', 'rifle', { damage: 28, rpm: 700, magSize: 30, reloadTime: 2.2, spread: 0.013, recoil: 1.0, range: 130, adsZoom: 1.5 }),
    ar_ak:         D('ar_ak', 'AK-47', 'ar', 'rifle', { damage: 35, rpm: 600, magSize: 30, reloadTime: 2.4, spread: 0.017, recoil: 1.5, range: 125, adsZoom: 1.5 }),
    shotgun_pump:  D('shotgun_pump', 'Pump Shotgun', 'shotgun', 'shell', { damage: 13, pellets: 8, rpm: 70, magSize: 6, reloadTime: 2.6, spread: 0.05, recoil: 3, range: 35, auto: false, adsZoom: 1.15, headshotMult: 1.5 }),
    shotgun_auto:  D('shotgun_auto', 'Auto Shotgun', 'shotgun', 'shell', { damage: 9, pellets: 8, rpm: 210, magSize: 8, reloadTime: 2.8, spread: 0.06, recoil: 2, range: 30, adsZoom: 1.15, headshotMult: 1.5 }),
    sniper_bolt:   D('sniper_bolt', 'Bolt Sniper', 'sniper', 'sniper', { damage: 120, rpm: 45, magSize: 5, reloadTime: 3.0, spread: 0.002, recoil: 4, range: 500, auto: false, adsZoom: 4, headshotMult: 2.5 }),
    sniper_semi:   D('sniper_semi', 'Semi Sniper', 'sniper', 'sniper', { damage: 75, rpm: 150, magSize: 10, reloadTime: 3.0, spread: 0.003, recoil: 2.5, range: 450, auto: false, adsZoom: 3.5, headshotMult: 2.3 }),
    rpg:           D('rpg', 'RPG', 'rpg', 'rocket', { damage: 150, rpm: 30, magSize: 1, reloadTime: 3.5, spread: 0.004, recoil: 5, range: 300, auto: false, adsZoom: 1.3, headshotMult: 1 }),
    mortar:        D('mortar', 'Mortar', 'mortar', 'mortar', { damage: 220, rpm: 20, magSize: 1, reloadTime: 0, spread: 0, recoil: 0, range: 2000, auto: false, adsZoom: 1, headshotMult: 1 })
  };
  const LIST = Object.keys(DEFS);

  const ATTACHMENTS = {
    scope: {
      none:   { name: 'Iron Sights', cost: 0,   zoom: 1 },
      reddot: { name: 'Red Dot',     cost: 100, zoom: 1.25 },
      acog:   { name: 'ACOG 4x',     cost: 250, zoom: 2.5 },
      sniper: { name: 'Sniper Scope', cost: 400, zoom: 4 }
    },
    mag: {
      standard: { name: 'Standard Mag', cost: 0,   magMult: 1 },
      extended: { name: 'Extended Mag (+50%)', cost: 150, magMult: 1.5 },
      drum:     { name: 'Drum Mag (+100%)',    cost: 300, magMult: 2 }
    }
  };

  // Advance with the simulation, so pausing also pauses reloads and fire cooldowns.
  let weaponTime = 0;
  const nowSec = function () { return weaponTime; };

  // ---------------------------------------------------------------- instances
  function refresh(inst) {
    const d = inst.def;
    const m = COD.RARITY[inst.rarity].mult;
    const sc = ATTACHMENTS.scope[inst.scope] || ATTACHMENTS.scope.none;
    const mg = ATTACHMENTS.mag[inst.mag] || ATTACHMENTS.mag.standard;
    let zoom = d.adsZoom;
    if (inst.scope !== 'none') zoom = Math.max(d.adsZoom, sc.zoom);
    const oldMag = inst.stats ? inst.stats.magSize : null;
    inst.stats = {
      damage: d.damage * m,
      rpm: d.rpm,
      magSize: Math.max(1, Math.round(d.magSize * m * mg.magMult)),
      reloadTime: d.reloadTime / m,
      spread: d.spread / m,
      recoil: d.recoil / m,
      range: d.range * m,
      zoom: zoom
    };
    if (d.cls === 'mortar') inst.stats.magSize = 1;
    // bigger magazine from an upgrade: top up by the difference
    if (oldMag !== null && inst.stats.magSize > oldMag && d.cls !== 'mortar') {
      inst.ammoInMag += inst.stats.magSize - oldMag;
    }
    if (inst.ammoInMag > inst.stats.magSize) inst.ammoInMag = inst.stats.magSize;
    return inst;
  }

  function create(defId, rarity) {
    const def = DEFS[defId];
    if (!def) { console.warn('[weapons] unknown weapon', defId); return null; }
    rarity = COD.clamp ? COD.clamp(rarity | 0, 0, 4) : Math.max(0, Math.min(4, rarity | 0));
    const inst = {
      defId: defId, def: def, rarity: rarity, ammoInMag: 0,
      scope: def.cls === 'sniper' ? 'sniper' : 'none', mag: 'standard',
      reloading: false, reloadEnd: 0, nextFire: 0, stats: null
    };
    refresh(inst);
    inst.ammoInMag = inst.stats.magSize;
    return inst;
  }

  function displayName(inst) {
    if (!inst) return '';
    return COD.RARITY[inst.rarity].name + ' ' + inst.def.name;
  }

  // ---------------------------------------------------------------- hitscan
  const _hit = { t: 0 };
  function rayCyl(o, d, cx, cz, r, y0, y1, tMax) {
    const ox = o.x - cx, oz = o.z - cz;
    const A = d.x * d.x + d.z * d.z;
    if (A < 1e-8) return -1;
    const B = ox * d.x + oz * d.z;
    const C = ox * ox + oz * oz - r * r;
    const disc = B * B - A * C;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t = (-B - sq) / A;
    if (t < 0) t = (-B + sq) / A;
    if (t < 0 || t > tMax) return -1;
    const y = o.y + d.y * t;
    if (y < y0 || y > y1) return -1;
    return t;
  }
  function raySphere(o, d, cx, cy, cz, r, tMax) {
    const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const c = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t = -b - sq;
    if (t < 0) t = -b + sq;
    if (t < 0 || t > tMax) return -1;
    return t;
  }

  // dir must be normalised
  function hitscan(shooter, origin, dir, range) {
    let tMax = range;
    let wHit = null;
    if (COD.world && COD.world.raycast) {
      wHit = COD.world.raycast(origin, dir, range);
      if (wHit) tMax = wHit.dist;
    }
    let best = null, bestT = tMax;
    const acts = COD.actors;
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (a === shooter || !a.alive || a.hidden || a.eliminated || !a.pos) continue;
      let t = -1, head = false;
      if (a.kind === 'drone') {
        t = raySphere(origin, dir, a.pos.x, a.pos.y, a.pos.z, 0.6, bestT);
      } else {
        // quick reject: closest approach to a bounding sphere
        const cy = a.pos.y + a.height * 0.5;
        const bx = a.pos.x - origin.x, by = cy - origin.y, bz = a.pos.z - origin.z;
        const proj = bx * dir.x + by * dir.y + bz * dir.z;
        if (proj < -2 || proj > bestT + 2) continue;
        const d2 = bx * bx + by * by + bz * bz - proj * proj;
        const rr = a.height * 0.5 + 0.6;
        if (d2 > rr * rr) continue;
        const tb = rayCyl(origin, dir, a.pos.x, a.pos.z, a.radius, a.pos.y, a.pos.y + a.height, bestT);
        const th = raySphere(origin, dir, a.pos.x, a.pos.y + a.height - 0.15, a.pos.z, 0.22, bestT);
        if (th >= 0 && (tb < 0 || th <= tb + 0.35)) { t = th; head = true; }
        else { t = tb; }
      }
      if (t >= 0 && t <= bestT) {
        bestT = t;
        best = { actor: a, headshot: head, point: null, dist: t, collider: null, normal: null };
      }
    }
    const vl = COD.vehicles && COD.vehicles.list;
    if (vl) {
      for (let i = 0; i < vl.length; i++) {
        const v = vl[i];
        if (!v || !v.pos || v.hp <= 0) continue;
        const t = raySphere(origin, dir, v.pos.x, v.pos.y + 0.8, v.pos.z, 1.6, bestT);
        if (t >= 0 && t <= bestT) {
          bestT = t;
          best = { actor: null, vehicle: v, headshot: false, point: null, dist: t, collider: null, normal: null };
        }
      }
    }
    if (best) {
      best.point =new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT);
      return best;
    }
    if (wHit) {
      return { actor: null, headshot: false, point: wHit.point, dist: wHit.dist, collider: wHit.collider, normal: wHit.normal || null };
    }
    return null;
  }

  // ---------------------------------------------------------------- muzzle flashes
  const flashes = [];
  let flashIdx = 0;
  function initFlashes() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.translate(64, 64);
    // star-shaped muzzle burst + hot core
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      g.save();
      g.rotate(i * 0.9 + 0.3);
      const len = 36 + (i % 3) * 14;
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, 'rgba(255,230,150,0.9)');
      gr.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, -5); g.lineTo(len, 0); g.lineTo(0, 5); g.closePath(); g.fill();
      g.restore();
    }
    const core = g.createRadialGradient(0, 0, 1, 0, 0, 30);
    core.addColorStop(0, 'rgba(255,255,235,1)');
    core.addColorStop(0.35, 'rgba(255,200,90,0.85)');
    core.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = core; g.fillRect(-64, -64, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      COD.scene.add(s);
      flashes.push({ sprite: s, life: 0 });
    }
  }
  function muzzleFlash(pos, size) {
    if (!flashes.length) return;
    const f = flashes[flashIdx++ % flashes.length];
    f.sprite.position.copy(pos);
    const sz = size * (0.8 + Math.random() * 0.5) * 1.5;
    f.sprite.scale.set(sz, sz, sz);
    f.sprite.material.rotation = Math.random() * 6.28;
    f.sprite.visible = true;
    f.life = 0.05;
    if (COD.projectiles && COD.projectiles.muzzleLight) COD.projectiles.muzzleLight(pos, size);
  }

  // ---------------------------------------------------------------- firing
  const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _d = new THREE.Vector3();
  const _muzzle = new THREE.Vector3(), _end = new THREE.Vector3(), _up0 = new THREE.Vector3(0, 1, 0);

  function spreadFactor(actor) {
    let f = 1;
    const ads = actor.fp ? actor.fp.ads || 0 : 0;
    f *= 1 - 0.65 * ads;
    if (actor.crouching) f *= 0.75;
    if (actor.sprinting) f *= 1.6;
    else if (actor.vel && (actor.vel.x * actor.vel.x + actor.vel.z * actor.vel.z) > 1) f *= 1.25;
    if (actor.onGround === false) f *= 1.8;
    return f;
  }

  function tryFire(actor, inst, origin, dir) {
    if (!actor || !inst || !actor.alive) return false;
    const t = nowSec();
    if (inst.reloading || t < inst.nextFire) return false;
    const def = inst.def, st = inst.stats;

    if (def.cls === 'mortar') {
      if (actor.kind === 'player' && COD.mortar && (actor.ammo.mortar | 0) > 0 && !COD.mortar.isOpen) {
        inst.nextFire = t + 0.4;
        COD.mortar.open(actor, inst);
      } else if (actor.kind === 'player' && (actor.ammo.mortar | 0) <= 0 && COD.hud && COD.hud.flash) {
        inst.nextFire = t + 0.6;
        COD.hud.flash('No mortar shells');
      }
      return false;
    }

    if (inst.ammoInMag <= 0) {
      inst.nextFire = t + 0.25;
      reload(actor, inst);
      return false;
    }
    inst.ammoInMag--;
    inst.nextFire = t + 60 / st.rpm;

    // direction basis
    _d.copy(dir).normalize();
    _right.crossVectors(_d, _up0);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _d).normalize();

    // muzzle position (visual only)
    _muzzle.copy(origin).addScaledVector(_d, 0.9);
    if (actor.kind === 'player') {
      _muzzle.addScaledVector(_right, 0.14).addScaledVector(_up, -0.1);
    }

    if (def.cls === 'rpg') {
      if (COD.projectiles) COD.projectiles.fireRocket(actor, origin, _d, inst);
      if (COD.sfx) COD.sfx('shot', origin);
      COD.emit('fire', { actor: actor, inst: inst });
      return true;
    }

    const sf = st.spread * spreadFactor(actor);
    const shotRange = st.range;
    const hits = new Map();
    const pellets = def.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      let rx = 0, ry = 0;
      if (sf > 0) {
        // uniform in disc
        const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * sf;
        rx = Math.cos(ang) * rad; ry = Math.sin(ang) * rad;
      }
      const pd = new THREE.Vector3().copy(_d).addScaledVector(_right, rx).addScaledVector(_up, ry).normalize();
      const h = hitscan(actor, origin, pd, shotRange);
      let endPoint;
      if (h) {
        endPoint = h.point;
        if (h.actor) {
          // distance falloff past half range
          let fall = 1;
          const half = shotRange * 0.5;
          if (h.dist > half) fall = 1 - 0.5 * Math.min(1, (h.dist - half) / half);
          let dmg = st.damage * fall;
          if (h.headshot) dmg *= def.headshotMult;
          let e = hits.get(h.actor);
          if (!e) { e = { amount: 0, head: false, point: h.point }; hits.set(h.actor, e); }
          e.amount += dmg;
          if (h.headshot) e.head = true;
        } else if (h.vehicle) {
          if (COD.vehicles.damage) {
            try { COD.vehicles.damage(h.vehicle, st.damage, actor); } catch (e) { console.warn(e); }
          }
          if (COD.projectiles && COD.projectiles.spawnImpact) COD.projectiles.spawnImpact(h.point, null);
        } else {
          if (h.collider && typeof h.collider.onHit === 'function') {
            try { h.collider.onHit(st.damage, { attacker: actor, weaponId: def.id, point: h.point }); } catch (e) { console.warn(e); }
          }
          if (COD.projectiles && COD.projectiles.spawnImpact) COD.projectiles.spawnImpact(h.point, h.normal, !!(h.collider && h.collider.type === 'window'));
        }
      } else {
        _end.copy(pd).multiplyScalar(Math.min(shotRange, 150)).add(origin);
        endPoint = _end;
      }
      if (COD.projectiles && COD.projectiles.spawnTracer && (p < 3 || Math.random() < 0.3)) {
        COD.projectiles.spawnTracer(_muzzle, endPoint);
      }
    }
    hits.forEach(function (e, target) {
      COD.combat.damage(target, e.amount, { attacker: actor, weaponId: def.id, headshot: e.head, point: e.point });
    });

    muzzleFlash(_muzzle, def.cls === 'shotgun' ? 0.7 : 0.45);
    if (COD.sfx) {
      COD.sfx(def.cls === 'sniper' ? 'sniper' : (def.cls === 'shotgun' ? 'shotgun' : 'shot'), origin);
    }
    COD.emit('fire', { actor: actor, inst: inst });
    return true;
  }

  function reload(actor, inst) {
    if (!actor || !inst || inst.reloading) return false;
    const def = inst.def;
    if (def.cls === 'mortar') return false;
    if (inst.ammoInMag >= inst.stats.magSize) return false;
    if ((actor.ammo[def.ammoType] | 0) <= 0) return false;
    const time = inst.stats.reloadTime;
    inst.reloading = true;
    inst.reloadEnd = nowSec() + time;
    inst._owner = actor;
    if (COD.sfx) COD.sfx('reload', actor.pos);
    COD.emit('reload', { actor: actor, inst: inst, time: time });
    return true;
  }

  function finishReload(actor, inst) {
    const type = inst.def.ammoType;
    const need = inst.stats.magSize - inst.ammoInMag;
    const take = Math.min(need, actor.ammo[type] | 0);
    inst.ammoInMag += take;
    actor.ammo[type] -= take;
    inst.reloading = false;
  }

  function update(dt) {
    weaponTime += dt;
    const t = nowSec();
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      if (f.life > 0) {
        f.life -= dt;
        if (f.life <= 0) f.sprite.visible = false;
      }
    }
    const acts = COD.actors;
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (!a.weapons) continue;
      const cur = a.weapons[a.weaponIndex];
      for (let j = 0; j < a.weapons.length; j++) {
        const w = a.weapons[j];
        if (!w) continue;
        if (w.def.cls === 'mortar') {
          w.ammoInMag = (a.ammo.mortar | 0) > 0 ? 1 : 0;
          continue;
        }
        if (w.reloading) {
          // cancel when swapped away or dead
          if (w !== cur || !a.alive) { w.reloading = false; continue; }
          if (t >= w.reloadEnd) finishReload(a, w);
        }
      }
    }
  }

  function init() {
    initFlashes();
  }

  COD.weapons = {
    DEFS: DEFS, LIST: LIST, ATTACHMENTS: ATTACHMENTS,
    create: create, refresh: refresh, tryFire: tryFire, reload: reload,
    hitscan: hitscan, displayName: displayName, init: init, update: update
  };
})();
