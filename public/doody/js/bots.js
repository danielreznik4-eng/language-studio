// bots.js - Bot AI (Owner: Chat 8). COD.bots = { init, update, spawnBot, list }
(function () {
  'use strict';
  const COD = window.COD;

  const bots = [];
  const teamCounter = {};
  let T = 0;            // local clock
  let pathBudget = 0;   // findPath calls allowed this frame
  let geo = null, skinMat = null, pantsMat = null;
  const teamMats = {};
  const NAMES = ['Ghost', 'Viper', 'Rook', 'Hawk', 'Maverick', 'Razor', 'Nomad', 'Frost', 'Cobra', 'Bishop',
    'Tango', 'Echo', 'Falcon', 'Sparks', 'Wolf', 'Dagger', 'Havoc', 'Onyx', 'Titan', 'Zero'];
  let nameIdx = 0;

  const _eye = new THREE.Vector3(), _tp = new THREE.Vector3(), _dir = new THREE.Vector3(),
    _delta = new THREE.Vector3();
  const candA = [], candD = [];

  // ---------- helpers ----------
  function wrapAng(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function turnTo(cur, want, step) {
    const d = wrapAng(want - cur);
    return Math.abs(d) <= step ? want : cur + (d > 0 ? step : -step);
  }
  function d2(a, b) { const x = a.x - b.x, z = a.z - b.z; return Math.sqrt(x * x + z * z); }
  function d3(a, b) { const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z; return Math.sqrt(x * x + y * y + z * z); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function aimPoint(t, out, head) {
    if (t.kind === 'drone') return out.copy(t.pos);
    return out.set(t.pos.x, t.pos.y + (head ? t.height - 0.15 : t.height * 0.7), t.pos.z);
  }
  function isEnemy(bot, a) {
    return a !== bot && a.alive && !a.eliminated && !a.hidden && a.team !== bot.team;
  }
  function hasLOS(a, b) {
    const W = COD.world;
    return (W && W.lineOfSight) ? !!W.lineOfSight(a, b) : true;
  }
  function magSize(inst) { return (inst.stats && inst.stats.magSize) || (inst.def && inst.def.magSize) || 30; }
  function curCls(inst) { return inst && inst.def ? inst.def.cls : 'ar'; }

  // ---------- mesh: jointed soldier ----------
  const L_ARM1 = 0.32, L_ARM2 = 0.30, L_THIGH = 0.42, L_SHIN = 0.40, BOOT_H = 0.08;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(),
    _down = new THREE.Vector3(0, -1, 0), _hand = new THREE.Vector3();
  let flashMat = null, flashGeo = null;
  const uniMats = {};

  function ensureGeo() {
    if (geo) return;
    const B = function (x, y, z) { return new THREE.BoxGeometry(x, y, z); };
    geo = {
      pelvis: B(0.4, 0.2, 0.26), thigh: B(0.18, L_THIGH, 0.2), shin: B(0.15, L_SHIN, 0.17), boot: B(0.15, BOOT_H, 0.3),
      chest: B(0.46, 0.5, 0.26), vest: B(0.5, 0.42, 0.32), plate: B(0.3, 0.26, 0.04), pouch: B(0.11, 0.12, 0.07),
      pack: B(0.34, 0.42, 0.17), packStripe: B(0.12, 0.3, 0.02), neck: B(0.1, 0.08, 0.1),
      head: new THREE.SphereGeometry(0.135, 12, 10),
      helmet: new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
      stripe: B(0.05, 0.02, 0.34), goggles: B(0.2, 0.06, 0.05),
      upper: B(0.11, L_ARM1, 0.11), fore: B(0.095, L_ARM2, 0.095), glove: B(0.1, 0.09, 0.11), band: B(0.125, 0.07, 0.125)
    };
    skinMat = new THREE.MeshStandardMaterial({ color: 0xd2a07a, roughness: 0.7 });
    pantsMat = new THREE.MeshStandardMaterial({ color: 0x2d3029, roughness: 0.9 });
    geo.bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
    geo.vestMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.65, metalness: 0.1 });
    geo.plateMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5, metalness: 0.5 });
    geo.helmMat = new THREE.MeshStandardMaterial({ color: 0x2f3a2c, roughness: 0.5, metalness: 0.15 });
    geo.gogMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.15, metalness: 0.8 });
    geo.gloveMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8 });
    flashGeo = new THREE.PlaneGeometry(0.4, 0.4);
  }
  function teamMat(team) {          // team-colour accents (armbands, helmet stripe, pack stripe)
    const k = team < 0 ? 'x' : team;
    if (!teamMats[k]) {
      const col = (COD.TEAMS[team] || { color: 0x888888 }).color;
      teamMats[k] = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, emissive: col, emissiveIntensity: 0.25 });
    }
    return teamMats[k];
  }
  function uniMat(team) {           // fatigues, lightly tinted by team
    const k = team < 0 ? 'x' : team;
    if (!uniMats[k]) {
      const c = new THREE.Color(0x4a5043);
      c.lerp(new THREE.Color((COD.TEAMS[team] || { color: 0x888888 }).color), 0.18);
      uniMats[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
    }
    return uniMats[k];
  }
  function makeFlash() {
    if (!flashMat) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(0.35, 'rgba(255,190,70,0.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
      flashMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false });
    }
    const f = new THREE.Mesh(flashGeo, flashMat);
    f.visible = false; f.renderOrder = 5;
    return f;
  }
  function makeTag(bot) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(bot.name, 128, 32);
    g.fillStyle = (COD.TEAMS[bot.team] || { css: '#fff' }).css; g.fillText(bot.name, 128, 32);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(1.8, 0.45, 1); spr.position.y = 2.15; spr.renderOrder = 10;
    spr.visible = bot.team === 0;
    return spr;
  }
  function buildMesh(bot) {
    ensureGeo();
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const hip = new THREE.Group(); hip.position.y = 0.9; body.add(hip);           // pelvis + legs
    const torso = new THREE.Group(); torso.position.y = 0.95; body.add(torso);     // everything above the waist
    const uni = uniMat(bot.team), acc = teamMat(bot.team);
    function add(g, m, x, y, z, parent) {
      const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; (parent || torso).add(me); return me;
    }
    add(geo.pelvis, pantsMat, 0, 0.02, 0, hip);
    const legs = [];
    [-0.11, 0.11].forEach(function (x) {
      const thigh = new THREE.Group(); thigh.position.set(x, 0, 0); hip.add(thigh);
      add(geo.thigh, pantsMat, 0, -L_THIGH / 2, 0, thigh);
      const shin = new THREE.Group(); shin.position.set(0, -L_THIGH, 0); thigh.add(shin);
      add(geo.shin, pantsMat, 0, -L_SHIN / 2, 0, shin);
      const boot = new THREE.Group(); boot.position.set(0, -L_SHIN, 0); shin.add(boot);
      add(geo.boot, geo.bootMat, 0, -BOOT_H / 2, -0.06, boot);
      legs.push({ thigh: thigh, shin: shin, boot: boot });
    });
    add(geo.chest, uni, 0, 0.27, 0);
    add(geo.vest, geo.vestMat, 0, 0.25, 0);
    add(geo.plate, geo.plateMat, 0, 0.29, -0.175);
    add(geo.plate, geo.plateMat, 0, 0.29, 0.175);
    add(geo.pouch, geo.vestMat, -0.1, 0.1, -0.19); add(geo.pouch, geo.vestMat, 0.1, 0.1, -0.19);
    add(geo.pack, geo.vestMat, 0, 0.3, 0.24);
    add(geo.packStripe, acc, 0, 0.3, 0.335);
    add(geo.neck, skinMat, 0, 0.56, 0);
    add(geo.head, skinMat, 0, 0.7, 0);
    add(geo.helmet, geo.helmMat, 0, 0.72, 0);
    add(geo.stripe, acc, 0, 0.89, 0);
    add(geo.goggles, geo.gogMat, 0, 0.72, -0.125);
    const arms = [];
    [-1, 1].forEach(function (side) {
      const up = new THREE.Group(); up.position.set(side * 0.3, 0.47, 0); torso.add(up);
      add(geo.upper, uni, 0, -L_ARM1 / 2, 0, up);
      add(geo.band, acc, 0, -0.09, 0, up);
      const fore = new THREE.Group(); fore.position.set(0, -L_ARM1, 0); up.add(fore);
      add(geo.fore, uni, 0, -L_ARM2 / 2, 0, fore);
      add(geo.glove, geo.gloveMat, 0, -L_ARM2 - 0.03, 0, fore);
      arms.push({ up: up, fore: fore, side: side });
    });
    const gunHolder = new THREE.Group(); gunHolder.position.set(0.08, 0.3, -0.22); torso.add(gunHolder);
    const flash = makeFlash(); flash.position.set(0, 0.03, -0.85); gunHolder.add(flash);
    const tag = makeTag(bot); root.add(tag);
    root.userData = { body: body, hip: hip, torso: torso, legs: legs, arms: arms, gunHolder: gunHolder, gun: null, gunInst: null,
      gunCls: '', flash: flash, flashT: 0, tag: tag, ph: 0, crouchK: 0, kick: 0, fallDir: 1 };
    solveArms(root.userData, 'ar');
    return root;
  }
  // two-bone IK: shoulder -> hand (torso-local), elbow bends down/out
  function solveArm(arm, H) {
    const S = arm.up.position;
    _a.copy(H).sub(S);
    let dist = _a.length();
    const maxD = L_ARM1 + L_ARM2 - 0.01;
    if (dist > maxD) { dist = maxD; _a.setLength(maxD); }
    else if (dist < 0.1) { dist = 0.1; _a.setLength(0.1); }
    const dx = _a.x / dist, dy = _a.y / dist, dz = _a.z / dist;      // shoulder -> hand direction
    const along = (L_ARM1 * L_ARM1 - L_ARM2 * L_ARM2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(L_ARM1 * L_ARM1 - along * along, 0));
    _c.set(arm.side * 0.7, -1, 0.15);                                // pole: down and outward
    const dot = _c.x * dx + _c.y * dy + _c.z * dz;
    _c.set(_c.x - dx * dot, _c.y - dy * dot, _c.z - dz * dot).normalize();
    const ex = dx * along + _c.x * h, ey = dy * along + _c.y * h, ez = dz * along + _c.z * h;   // elbow offset from shoulder
    _b.set(ex, ey, ez).normalize();
    arm.up.quaternion.setFromUnitVectors(_down, _b);
    _b.set(_a.x - ex, _a.y - ey, _a.z - ez).normalize();             // elbow -> hand
    _q.copy(arm.up.quaternion).invert();
    _b.applyQuaternion(_q);
    arm.fore.quaternion.setFromUnitVectors(_down, _b);
  }
  function solveArms(ud, cls) {
    ud.gunCls = cls;
    const gp = ud.gunHolder.position;
    const fore = cls === 'pistol' ? 0.04 : (cls === 'sniper' ? 0.36 : (cls === 'shotgun' ? 0.3 : 0.28));
    for (let i = 0; i < ud.arms.length; i++) {
      const a = ud.arms[i];
      if (a.side > 0) _hand.set(gp.x, gp.y, gp.z);
      else _hand.set(gp.x - 0.02, gp.y, gp.z - fore);
      solveArm(a, _hand);
    }
  }
  function updateGun(bot) {
    const ud = bot.mesh.userData, cur = COD.currentWeapon(bot);
    if (cur === ud.gunInst) return;
    ud.gunInst = cur;
    if (ud.gun) { ud.gunHolder.remove(ud.gun); ud.gun = null; }
    if (cur && COD.viewmodel && COD.viewmodel.buildWeaponMesh) {
      try {
        const g = COD.viewmodel.buildWeaponMesh(curCls(cur), cur.rarity || 0);
        if (g) {
          g.scale.setScalar(0.9); ud.gunHolder.add(g); ud.gun = g;
          g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
        }
      } catch (e) { /* viewmodel not ready */ }
    }
    if (curCls(cur) !== ud.gunCls) solveArms(ud, curCls(cur));
  }

  // ---------- state ----------
  function newAI(idx) {
    return {
      idx: idx, skill: 0.55 + Math.random() * 0.4,
      mode: 'idle', target: null, targetSeen: -99, los: false, lastKnown: new THREE.Vector3(), scanIdx: 0,
      thinkT: Math.random() * 0.3, reactUntil: 0, headAim: false,
      goal: new THREE.Vector3(), arrive: 1.5, path: [], pi: 0, hasPath: false, pathGoal: new THREE.Vector3(), repathT: 0,
      strafe: 1, strafeT: 0, burst: 3, burstWait: 0, swapT: 0, grenT: T + rnd(5, 15),
      stuckPos: new THREE.Vector3(), stuckT: 0, stuckN: 0, sideT: 0, sideDir: 1, jumpNow: false, speedNow: 0,
      black: new Map(), chest: null, lootAllowed: T + rnd(0, 6), upgradeAllowed: T + 20,
      cover: null, coverUntil: 0, coverCool: 0,
      holdOff: new THREE.Vector3(), holdT: 0,
      veh: null, vehUntil: 0, vehCool: T + 8, driveGoal: new THREE.Vector3(), driveStart: 0, stuckV: 0, reverseT: 0, revN: 0,
      dead: false, deadT: 0
    };
  }
  function resetAI(bot) {
    const ai = bot.ai;
    ai.target = null; ai.los = false; ai.mode = 'idle'; ai.hasPath = false; ai.path = [];
    ai.cover = null; ai.chest = null; ai.veh = null; ai.burstWait = 0; ai.speedNow = 0; ai.jumpNow = false;
    ai.thinkT = Math.random() * 0.3; ai.coverCool = 0;
    ai.stuckPos.copy(bot.pos); ai.stuckT = 0; ai.stuckN = 0;
    bot.vel.set(0, 0, 0); bot.onGround = true;
    revive(bot);
  }
  function revive(bot) {
    const ai = bot.ai, ud = bot.mesh.userData;
    ai.dead = false; ai.deadT = 0;
    ud.body.rotation.x = 0; ud.body.rotation.z = 0; ud.body.position.y = 0;
    ud.kick = 0; ud.crouchK = 0;
    bot.mesh.visible = true;
    ud.tag.visible = bot.team === 0;
  }
  function deadVisual(bot, dt) {
    const ai = bot.ai, m = bot.mesh, ud = m.userData;
    if (!ai.dead) {
      ai.dead = true; ai.deadT = 0; ai.target = null; ai.hasPath = false; ai.mode = 'idle';
      bot.sprinting = false; ai.speedNow = 0; ud.tag.visible = false; ud.flash.visible = false;
      ud.fallDir = Math.random() < 0.5 ? 1 : -1;
      if (bot.height < 1.8) bot.height = 1.8;
    }
    ai.deadT += dt;
    m.position.copy(bot.pos); m.rotation.y = bot.yaw;
    const u = Math.min(1, ai.deadT / 0.55), e = 1 - (1 - u) * (1 - u);     // ease-out fall
    ud.body.rotation.x = ud.fallDir * -e * Math.PI / 2 * 0.95;
    ud.body.rotation.z = (1 - u) * 0.1 * ud.fallDir;
    ud.body.position.y = 0.12 * e;
    ud.torso.rotation.x *= 0.9;
    for (let i = 0; i < ud.legs.length; i++) { ud.legs[i].thigh.rotation.x *= 0.92; ud.legs[i].shin.rotation.x *= 0.92; }
    if (ai.deadT > 3) m.visible = false;
  }

  // ---------- weapons ----------
  function usable(bot, w) {
    if (!w || !w.def) return false;
    const c = w.def.cls;
    if (c === 'rpg' || c === 'mortar') return false;
    return w.ammoInMag > 0 || (bot.ammo[w.def.ammoType] || 0) > 0;
  }
  const PREF = {
    near: { shotgun: 3, smg: 2.6, ar: 2, pistol: 1.5, sniper: 0.5 },
    mid: { ar: 3, smg: 2, sniper: 2, pistol: 1, shotgun: 0.5 },
    far: { sniper: 3, ar: 2.5, smg: 0.8, pistol: 0.5, shotgun: 0.1 }
  };
  function selectWeapon(bot, ai, dist) {
    if (T < ai.swapT) return;
    const tab = dist < 10 ? PREF.near : dist < 35 ? PREF.mid : PREF.far;
    let best = -1, bs = -1;
    for (let i = 0; i < bot.weapons.length; i++) {
      const w = bot.weapons[i];
      if (!usable(bot, w)) continue;
      const s = (tab[w.def.cls] || 0.3) + (w.rarity || 0) * 0.2;
      if (s > bs) { bs = s; best = i; }
    }
    if (best >= 0 && best !== bot.weaponIndex) setWeapon(bot, ai, best);
  }
  function setWeapon(bot, ai, i) {
    bot.weaponIndex = i; ai.swapT = T + 2.5; ai.reactUntil = Math.max(ai.reactUntil, T + 0.35);
    COD.emit('swap', { actor: bot });
  }
  function switchAny(bot, ai) {
    for (let i = 0; i < bot.weapons.length; i++) {
      if (i !== bot.weaponIndex && usable(bot, bot.weapons[i])) { setWeapon(bot, ai, i); return; }
    }
  }
  function prefDist(inst) {
    switch (curCls(inst)) { case 'shotgun': return 8; case 'smg': return 14; case 'pistol': return 13; case 'sniper': return 50; default: return 24; }
  }
  function burstSize(inst) {
    switch (curCls(inst)) { case 'smg': return 5 + ((Math.random() * 5) | 0); case 'ar': return 3 + ((Math.random() * 4) | 0);
      case 'pistol': return 1 + ((Math.random() * 3) | 0); default: return 1; }
  }

  function shoot(bot, ai, dt, dist, tgt) {
    const cur = COD.currentWeapon(bot);
    if (!cur || !COD.weapons) return;
    if (cur.reloading) return;
    if (cur.ammoInMag <= 0) {
      if (!COD.weapons.reload(bot, cur)) switchAny(bot, ai);
      return;
    }
    if (T < ai.reactUntil) return;
    if (ai.burstWait > 0) { ai.burstWait -= dt; return; }
    const range = (cur.stats && cur.stats.range) || (cur.def && cur.def.range) || 60;
    if (dist > range * 0.95) return;
    COD.eyePos(bot, _eye);
    aimPoint(tgt, _tp, ai.headAim);
    const noise = (0.12 + dist * 0.012) * (1.6 - ai.skill) * (ai.speedNow > 1 ? 1.3 : 1);
    _tp.x += (Math.random() - 0.5) * 2 * noise; _tp.y += (Math.random() - 0.5) * 2 * noise; _tp.z += (Math.random() - 0.5) * 2 * noise;
    _dir.copy(_tp).sub(_eye);
    const len = _dir.length();
    if (len < 0.01) return;
    _dir.multiplyScalar(1 / len);
    if (Math.abs(wrapAng(Math.atan2(-_dir.x, -_dir.z) - bot.yaw)) > 0.2) return;
    if (COD.weapons.tryFire(bot, cur, _eye, _dir)) {
      ai.burst--;
      if (ai.burst <= 0) {
        const c = curCls(cur);
        ai.burstWait = c === 'sniper' ? rnd(0.8, 1.6) : c === 'smg' ? rnd(0.2, 0.5) : rnd(0.3, 0.9);
        ai.burst = burstSize(cur);
      }
    }
  }

  // ---------- movement ----------
  function stepMove(bot, ai, dx, dz, speed, dt) {
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 1e-4) { bot.vel.x = dx / len * speed; bot.vel.z = dz / len * speed; } else { bot.vel.x = 0; bot.vel.z = 0; }
    if (bot.onGround) { if (bot.vel.y < 0) bot.vel.y = 0; } else bot.vel.y -= 24 * dt;
    if (bot.onGround && ai.jumpNow) { bot.vel.y = 8.5; bot.onGround = false; }
    ai.jumpNow = false;
    _delta.set(bot.vel.x * dt, bot.vel.y * dt, bot.vel.z * dt);
    const W = COD.world;
    let blocked = null;
    if (W && W.resolveMove) {
      const res = W.resolveMove(bot.pos, _delta, bot.radius, bot.height);
      if (res) {
        bot.onGround = !!res.onGround;
        blocked = res.blocked || null;
        if (blocked && blocked.type === 'low' && bot.onGround) ai.jumpNow = true;
      }
    } else {
      bot.pos.add(_delta);
      if (W && W.heightAt) { const h = W.heightAt(bot.pos.x, bot.pos.z); if (bot.pos.y < h) { bot.pos.y = h; bot.onGround = true; } }
    }
    ai.speedNow = len > 1e-4 ? speed : 0;
    return blocked;
  }

  function followPath(ai, pos, goal, advR) {
    const need = !ai.hasPath || ai.pathGoal.distanceToSquared(goal) > 16 || T > ai.repathT;
    if (need && pathBudget > 0) {
      pathBudget--;
      let p = null;
      if (COD.world && COD.world.findPath) { try { p = COD.world.findPath(pos, goal); } catch (e) { p = null; } }
      ai.path = (p && p.length) ? p : [goal.clone()];
      ai.pi = 0; ai.pathGoal.copy(goal); ai.hasPath = true; ai.repathT = T + 2.5 + Math.random() * 1.5;
    }
    if (!ai.hasPath) return goal;
    const p = ai.path;
    while (ai.pi < p.length - 1 && d2(pos, p[ai.pi]) < advR) ai.pi++;
    return p[ai.pi] || goal;
  }

  // walk toward ai.goal; returns true when arrived
  function moveAlong(bot, ai, speed, dt, arriveR) {
    const g = ai.goal;
    if (d2(bot.pos, g) <= arriveR) { stepMove(bot, ai, 0, 0, 0, dt); return true; }
    const wp = followPath(ai, bot.pos, g, 1.3);
    let dx = wp.x - bot.pos.x, dz = wp.z - bot.pos.z;
    bot.yaw = turnTo(bot.yaw, Math.atan2(-dx, -dz), 10 * dt);
    if (ai.sideT > 0) {
      ai.sideT -= dt;
      const l = Math.sqrt(dx * dx + dz * dz) || 1;
      const px = -dz / l, pz = dx / l;
      dx += px * ai.sideDir * 2; dz += pz * ai.sideDir * 2;
    }
    stepMove(bot, ai, dx, dz, speed, dt);
    return false;
  }

  function checkStuck(bot, ai, dt) {
    ai.stuckT += dt;
    if (ai.stuckT < 1) return;
    ai.stuckT = 0;
    if (ai.speedNow > 0.5 && ai.mode !== 'fight' && d2(bot.pos, ai.stuckPos) < 0.35) {
      ai.stuckN++;
      ai.jumpNow = true; ai.sideT = 0.6; ai.sideDir = Math.random() < 0.5 ? -1 : 1; ai.repathT = 0;
      if (ai.mode === 'loot' && ai.chest && d2(bot.pos, ai.chest.pos) < 3.2) onArrive(bot, ai);
      if (ai.stuckN >= 4) {
        ai.stuckN = 0;
        if (ai.chest) { ai.black.set(ai.chest, T + 40); ai.chest = null; }
        ai.lootAllowed = T + 10; ai.holdT = 0; ai.hasPath = false;
      }
    } else ai.stuckN = 0;
    ai.stuckPos.copy(bot.pos);
  }

  // ---------- goal selection ----------
  function capturePoint(bot, ai) {
    const pts = (COD.gamemode && COD.gamemode.points && COD.gamemode.points.length) ? COD.gamemode.points :
      ((COD.world && COD.world.controlPoints) || []);
    if (!pts.length) return null;
    const pref = pts[ai.idx % pts.length];
    if (pref.owner !== bot.team) return pref;
    let best = null, bd = 1e9;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].owner === bot.team) continue;
      const d = d2(bot.pos, pts[i].pos);
      if (d < bd) { bd = d; best = pts[i]; }
    }
    return best || pref;
  }
  function findCar(bot) {
    const L = COD.vehicles && COD.vehicles.list;
    if (!L) return null;
    let best = null, bd = 45;
    for (let i = 0; i < L.length; i++) {
      const v = L[i];
      if (v.type !== 'car' || v.driver || v.hp <= 0 || v.destroyed || v.auto) continue;
      const d = d2(bot.pos, v.pos);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  function chooseGoal(bot, ai) {
    // heading to a vehicle
    if (ai.veh) {
      const v = ai.veh;
      if (v.driver || v.hp <= 0 || T > ai.vehUntil) ai.veh = null;
      else { ai.goal.copy(v.pos); ai.arrive = 2.6; return 'tovehicle'; }
    }
    // loot
    if (T >= ai.lootAllowed && COD.loot && COD.loot.chests) {
      const ch = COD.loot.chests;
      let best = null, bd = 45;
      for (let i = 0; i < ch.length; i++) {
        const c = ch[i];
        if (c.opened) continue;
        const bl = ai.black.get(c);
        if (bl && bl > T) continue;
        const d = d2(bot.pos, c.pos);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) { ai.chest = best; ai.goal.copy(best.pos); ai.arrive = 1.8; return 'loot'; }
    }
    // upgrade station
    if (bot.gold >= 300 && T >= ai.upgradeAllowed && COD.world && COD.world.stationSpots) {
      let best = null, bd = 60;
      const S = COD.world.stationSpots;
      for (let i = 0; i < S.length; i++) { const d = d2(bot.pos, S[i].pos); if (d < bd) { bd = d; best = S[i]; } }
      if (best) { ai.goal.copy(best.pos); ai.arrive = 2.4; return 'upgrade'; }
    }
    // capture / defend
    const pt = capturePoint(bot, ai);
    if (!pt) { ai.arrive = 3; ai.goal.copy(bot.pos); return 'idle'; }
    ai.holdT -= 0.2;
    if (ai.holdT <= 0) {
      ai.holdT = rnd(3, 7);
      const a = Math.random() * 6.283, r = Math.random() * pt.radius * 0.6;
      ai.holdOff.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    ai.goal.set(pt.pos.x + ai.holdOff.x, pt.pos.y, pt.pos.z + ai.holdOff.z);
    ai.arrive = 1.2;
    // long trip -> try a car
    if (!bot.vehicle && T > ai.vehCool && d2(bot.pos, ai.goal) > 120) {
      const v = findCar(bot);
      if (v) {
        ai.veh = v; ai.vehUntil = T + 25; ai.driveGoal.copy(ai.goal);
        ai.goal.copy(v.pos); ai.arrive = 2.6;
        return 'tovehicle';
      }
      ai.vehCool = T + 10;
    }
    return 'capture';
  }
  function onArrive(bot, ai) {
    if (ai.mode === 'loot') {
      const c = ai.chest;
      if (c && !c.opened && COD.loot && COD.loot.open) { try { COD.loot.open(c, bot); } catch (e) { /* ignore */ } }
      if (c) ai.black.set(c, T + 25);
      ai.chest = null; ai.lootAllowed = T + rnd(6, 16); ai.hasPath = false;
    } else if (ai.mode === 'upgrade') {
      ai.upgradeAllowed = T + 40;
      const L = COD.loot;
      if (L && L.upgrade) {
        for (let i = 0; i < 4; i++) {
          const cur = COD.currentWeapon(bot); let ok = false;
          try { ok = cur && L.upgrade(bot, cur); } catch (e) { ok = false; }
          if (!ok) break;
        }
        const cur = COD.currentWeapon(bot);
        if (cur && L.attach) {
          try {
            L.attach(bot, cur, 'mag', 'extended');
            L.attach(bot, cur, 'scope', curCls(cur) === 'sniper' ? 'sniper' : 'reddot');
          } catch (e) { /* ignore */ }
        }
      }
      ai.hasPath = false;
    } else if (ai.mode === 'tovehicle') {
      const v = ai.veh;
      if (v && !v.driver && COD.vehicles && COD.vehicles.enter) {
        try { COD.vehicles.enter(bot, v); } catch (e) { /* ignore */ }
      }
      if (v && bot.vehicle === v && v.driver === bot) {
        ai.driveStart = T; ai.stuckV = 0; ai.reverseT = 0; ai.revN = 0;
      } else ai.vehCool = T + 15;
      ai.veh = null; ai.hasPath = false;
    }
  }
  function pickCover(bot, ai) {
    const pts = COD.world && COD.world.coverPoints;
    const en = ai.target ? ai.target.pos : ai.lastKnown;
    let best = null, bs = 1e9;
    if (pts) {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], db = d2(bot.pos, p);
        if (db > 35) continue;
        const de = d2(p, en);
        if (ai.target && de < 8) continue;
        const s = db - 0.6 * de;
        if (s < bs) { bs = s; best = p; }
      }
    }
    if (!best) {
      const dx = bot.pos.x - en.x, dz = bot.pos.z - en.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
      best = new THREE.Vector3(bot.pos.x + dx / l * 20, bot.pos.y, bot.pos.z + dz / l * 20);
    }
    ai.cover = best;
  }

  // ---------- think (5 Hz) ----------
  function scanEnemies(bot, ai) {
    COD.eyePos(bot, _eye);
    let t = ai.target;
    if (t && (!isEnemy(bot, t) || d3(bot.pos, t.pos) > 100)) { t = ai.target = null; ai.los = false; }
    if (t) {                       // 1 raycast
      aimPoint(t, _tp, false);
      ai.los = hasLOS(_eye, _tp);
      if (ai.los) { ai.targetSeen = T; ai.lastKnown.copy(t.pos); }
      else if (T - ai.targetSeen > 5) { ai.target = null; }
    }
    if (ai.target && ai.los) return;
    // look for a new target: one candidate per think -> max 5 rays / s
    candA.length = 0; candD.length = 0;
    const A = COD.actors;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (!isEnemy(bot, a)) continue;
      const d = d3(bot.pos, a.pos);
      if (d < (a.kind === 'drone' ? 80 : 55)) { candA.push(a); candD.push(d); }
    }
    if (!candA.length) return;
    const k = Math.min(ai.scanIdx++ % 3, candA.length - 1);
    let pick = -1;
    for (let r = 0; r <= k; r++) {
      let bi = -1, bd = 1e9;
      for (let i = 0; i < candA.length; i++) if (candD[i] < bd) { bd = candD[i]; bi = i; }
      pick = bi; candD[bi] = 1e9 + 1;
    }
    const c = candA[pick];
    if (c === ai.target) return;
    aimPoint(c, _tp, false);
    if (hasLOS(_eye, _tp)) {
      if (!ai.target) { ai.reactUntil = T + rnd(0.25, 0.6); ai.headAim = Math.random() < 0.2; }
      ai.target = c; ai.los = true; ai.targetSeen = T; ai.lastKnown.copy(c.pos);
    }
  }

  function think(bot, ai) {
    const cur = COD.currentWeapon(bot);
    const driving = bot.vehicle && bot.vehicle.driver === bot;
    const enemyNear = ai.target && (T - ai.targetSeen < 1.5);

    if (bot.armor <= 75 && bot.plates > 0 && (!enemyNear || bot.armor < 50)) COD.wearPlate(bot);
    if (bot.hp < 60 && bot.medkits > 0 && (!enemyNear || bot.hp < 30)) COD.useMedkit(bot);

    if (driving) {
      const v = bot.vehicle;
      ai.mode = 'drive';
      if (d2(v.pos, ai.driveGoal) < 30) {
        if (v.control) { v.control.throttle = 0; v.control.steer = 0; }
        try { COD.vehicles.exit(bot); } catch (e) { /* ignore */ }
        ai.vehCool = T + 25; ai.mode = 'idle'; ai.hasPath = false;
      }
      return;
    }

    if (cur && !cur.reloading && cur.ammoInMag < magSize(cur) * 0.3 && !enemyNear) COD.weapons.reload(bot, cur);

    scanEnemies(bot, ai);
    const hasT = ai.target && (T - ai.targetSeen < 3);
    if (hasT) {
      const dist = d3(bot.pos, ai.target.pos);
      selectWeapon(bot, ai, dist);
      if (ai.los && dist > 10 && dist < 35 && bot.grenades.length && T > ai.grenT && Math.random() < 0.25 &&
        COD.projectiles && COD.projectiles.throwGrenade) {
        COD.eyePos(bot, _eye); aimPoint(ai.target, _tp, false);
        _dir.copy(_tp).sub(_eye); const dd = _dir.length() || 1; _dir.multiplyScalar(1 / dd);
        _dir.y += 0.2 + dd * 0.012; _dir.normalize();
        try { COD.projectiles.throwGrenade(bot, _eye.clone(), _dir.clone(), bot.grenades.shift()); } catch (e) { /* ignore */ }
        ai.grenT = T + rnd(8, 18);
      }
    } else if (cur && !usable(bot, cur)) switchAny(bot, ai);

    const inCover = ai.mode === 'cover';
    if (inCover && T >= ai.coverUntil) ai.coverCool = T + 20;
    const wantCover = (bot.hp < 40 && (inCover ? T < ai.coverUntil : T >= ai.coverCool)) ||
      (inCover && T < ai.coverUntil && bot.hp < 70);
    let mode;
    if (wantCover) mode = 'cover';
    else if (hasT && ai.los) mode = 'fight';
    else if (hasT) mode = 'hunt';
    else mode = chooseGoal(bot, ai);
    if (mode !== ai.mode) {
      if (mode === 'cover') { pickCover(bot, ai); ai.coverUntil = T + 12; }
      ai.mode = mode; ai.hasPath = false;
    }
  }

  // ---------- act (every frame) ----------
  function faceTarget(bot, ai, dt) {
    const t = ai.target;
    COD.eyePos(bot, _eye);
    aimPoint(t, _tp, ai.headAim);
    const dx = _tp.x - _eye.x, dy = _tp.y - _eye.y, dz = _tp.z - _eye.z;
    const h = Math.sqrt(dx * dx + dz * dz);
    bot.yaw = turnTo(bot.yaw, Math.atan2(-dx, -dz), (6 + 4 * ai.skill) * dt);
    bot.pitch = COD.clamp(Math.atan2(dy, h || 0.01), -1.2, 1.2);
    return h;
  }

  function driveAct(bot, ai, dt) {
    const v = bot.vehicle;
    if (!v || v.driver !== bot) return;
    if (!v.control) v.control = { throttle: 0, steer: 0 };
    const c = v.control;
    bot.yaw = v.yaw;
    if (ai.reverseT > 0) {
      ai.reverseT -= dt; c.throttle = -1; c.steer = ai.sideDir;
      return;
    }
    const wp = followPath(ai, v.pos, ai.driveGoal, 4);
    const dx = wp.x - v.pos.x, dz = wp.z - v.pos.z;
    const diff = wrapAng(Math.atan2(-dx, -dz) - v.yaw);   // + = need to turn left (yaw increases)
    c.steer = COD.clamp(diff * 2, -1, 1);
    c.throttle = Math.abs(diff) < 1.0 ? 1 : 0.4;
    ai.speedNow = Math.abs(v.speed || 0);
    if (Math.abs(v.speed || 0) < 0.8 && T > ai.driveStart + 2) ai.stuckV += dt; else ai.stuckV = 0;
    if (ai.stuckV > 2) {
      ai.stuckV = 0; ai.reverseT = 1.4; ai.revN++; ai.sideDir = Math.random() < 0.5 ? -1 : 1; ai.repathT = 0;
      if (ai.revN > 3) {
        c.throttle = 0; c.steer = 0;
        try { COD.vehicles.exit(bot); } catch (e) { /* ignore */ }
        ai.vehCool = T + 25; ai.mode = 'idle'; ai.hasPath = false;
      }
    }
  }

  function act(bot, ai, dt) {
    bot.sprinting = false; bot.crouching = false;
    ai.speedNow = 0;
    const t = ai.target;
    switch (ai.mode) {
      case 'drive': driveAct(bot, ai, dt); break;
      case 'fight': {
        if (!t) break;
        const h = faceTarget(bot, ai, dt);
        const dist = d3(bot.pos, t.pos);
        ai.strafeT -= dt;
        if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeT = rnd(0.7, 2); }
        const pref = prefDist(COD.currentWeapon(bot));
        const fw = h > pref * 1.3 ? 1 : (h < pref * 0.5 ? -1 : 0);
        const fx = (t.pos.x - bot.pos.x) / (h || 1), fz = (t.pos.z - bot.pos.z) / (h || 1);
        const vx = fx * fw * 0.9 + (-fz) * ai.strafe * 0.7, vz = fz * fw * 0.9 + fx * ai.strafe * 0.7;
        const blk = stepMove(bot, ai, vx, vz, 4.2, dt);
        if (blk) ai.strafe = -ai.strafe;
        shoot(bot, ai, dt, dist, t);
        break;
      }
      case 'hunt': {
        ai.goal.copy(ai.lastKnown); ai.arrive = 3;
        moveAlong(bot, ai, 5, dt, 3);
        break;
      }
      case 'cover': {
        const g = ai.cover;
        if (g && d2(bot.pos, g) > 1.5) {
          ai.goal.copy(g);
          bot.sprinting = true;
          moveAlong(bot, ai, 6.5, dt, 1.5);
        } else {
          bot.crouching = true;
          stepMove(bot, ai, 0, 0, 0, dt);
        }
        if (t && ai.los && T - ai.targetSeen < 1) { const h = faceTarget(bot, ai, dt); shoot(bot, ai, dt, d3(bot.pos, t.pos), t); }
        break;
      }
      case 'idle': stepMove(bot, ai, 0, 0, 0, dt); break;
      default: {
        const arrived = moveAlong(bot, ai, 6.2, dt, ai.arrive);
        bot.sprinting = !arrived;
        if (arrived) { if (ai.mode === 'loot' || ai.mode === 'upgrade' || ai.mode === 'tovehicle') onArrive(bot, ai); }
        bot.pitch *= 0.9;
      }
    }
    bot.height = bot.crouching ? 1.1 : 1.8;
    if (ai.mode !== 'drive') checkStuck(bot, ai, dt);
  }

  function syncMesh(bot, dt) {
    const m = bot.mesh, ud = m.userData, ai = bot.ai;
    const veh = bot.vehicle;
    m.visible = !bot.hidden && !(veh && veh.type === 'car');
    m.position.copy(bot.pos);
    m.rotation.y = bot.yaw;
    const sp = ai.speedNow;
    const k = Math.min(1, sp / 3), run = Math.min(1, sp / 6.5);
    ud.ph += sp * dt * 1.3;
    ud.crouchK += ((bot.crouching ? 1 : 0) - ud.crouchK) * Math.min(1, dt * 10);
    const c = ud.crouchK;
    const amp = (0.45 + 0.35 * run) * k * (1 - c * 0.6);
    const air = bot.onGround ? 0 : 0.5;
    let deepest = 0;
    for (let i = 0; i < 2; i++) {
      const p = ud.ph + i * Math.PI, leg = ud.legs[i];
      const t = Math.sin(p) * amp + c * 1.2 + air * (i ? 1 : -0.4);
      const kn = -(0.05 + Math.max(0, Math.cos(p)) * amp * 1.3 + c * 2.0 + air);
      leg.thigh.rotation.x = t; leg.shin.rotation.x = kn; leg.boot.rotation.x = -(t + kn);
      const depth = L_THIGH * Math.cos(t) + L_SHIN * Math.cos(t + kn);
      if (depth > deepest) deepest = depth;
    }
    const hipY = deepest + BOOT_H;
    ud.hip.position.y = hipY;
    ud.torso.position.y = hipY + 0.05;
    ud.kick = Math.max(0, ud.kick - dt * 8);
    const lean = (bot.sprinting ? -0.22 * run : 0) - c * 0.2 + COD.clamp(bot.pitch || 0, -0.8, 0.8) * 0.55 + ud.kick * 0.07;
    ud.torso.rotation.x += (lean - ud.torso.rotation.x) * Math.min(1, dt * 12);
    ud.torso.rotation.y = Math.sin(ud.ph) * 0.06 * k;
    if (ud.flashT > 0) { ud.flashT -= dt; if (ud.flashT <= 0) ud.flash.visible = false; }
    ud.tag.visible = bot.team === 0;
    updateGun(bot);
  }

  function updateBot(bot, dt) {
    const ai = bot.ai;
    if (!bot.alive || bot.eliminated) { deadVisual(bot, dt); return; }
    if (ai.dead) revive(bot);
    const veh = bot.vehicle;
    if (veh && (veh.auto || veh.driver !== bot)) {      // boat landing / passenger
      bot.sprinting = false; ai.speedNow = 0; ai.target = null; ai.hasPath = false; ai.mode = 'idle';
      syncMesh(bot, dt);
      return;
    }
    ai.thinkT -= dt;
    if (ai.thinkT <= 0) { ai.thinkT = 0.2 + Math.random() * 0.05; think(bot, ai); }
    act(bot, ai, dt);
    syncMesh(bot, dt);
  }

  // ---------- public ----------
  function spawnBot(team, name) {
    const bot = COD.makeActor({ kind: 'bot', team: team, name: name || NAMES[(nameIdx++) % NAMES.length] });
    try {
      bot.weapons.push(COD.weapons.create('ar_m4', 0), COD.weapons.create('pistol_m9', 0));
    } catch (e) { /* weapons not ready */ }
    bot.grenades = [0, 0];
    const idx = teamCounter[team] | 0; teamCounter[team] = idx + 1;
    bot.ai = newAI(idx);
    bot.mesh = buildMesh(bot);
    COD.scene.add(bot.mesh);
    const sp = COD.world && COD.world.teamSpawns && COD.world.teamSpawns[team];
    if (sp) bot.pos.copy(sp.from);
    bot.mesh.position.copy(bot.pos);
    bot.ai.stuckPos.copy(bot.pos);
    COD.actors.push(bot);
    bots.push(bot);
    return bot;
  }

  function init() {
    COD.on('spawn', function (e) {
      const a = e && e.actor;
      if (a && a.kind === 'bot' && a.ai) resetAI(a);
    });
    COD.on('fire', function (e) {
      const a = e && e.actor;
      if (a && a.kind === 'bot' && a.mesh) {
        const ud = a.mesh.userData;
        ud.kick = 1; ud.flashT = 0.05; ud.flash.visible = true;
        ud.flash.rotation.z = Math.random() * 6.28;
        ud.flash.scale.setScalar(0.6 + Math.random() * 0.6);
      }
    });
    COD.on('damage', function (e) {
      const t = e && e.target, a = e && e.attacker;
      if (!t || t.kind !== 'bot' || !t.ai || !a || a.team === t.team || !a.alive) return;
      const ai = t.ai;
      if (!ai.target || !ai.los || Math.random() < 0.3) {
        ai.target = a; ai.targetSeen = T; ai.lastKnown.copy(a.pos); ai.los = false;
        ai.reactUntil = Math.max(ai.reactUntil, T + 0.3);
      }
    });
  }

  function update(dt) {
    T += dt;
    pathBudget = 3;
    for (let i = 0; i < bots.length; i++) {
      try { updateBot(bots[i], dt); } catch (e) { if (!updateBot.warned) { updateBot.warned = true; console.error('bot error', e); } }
    }
  }

  COD.bots = { init: init, update: update, spawnBot: spawnBot, list: bots };
})();
